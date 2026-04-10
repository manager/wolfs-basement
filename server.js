const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 50 * 1024 * 1024 }); // 50MB for images

app.use(express.static(path.join(__dirname, 'public')));

// --- System Stats (CPU/RAM) ---
const os = require('os');
let lastCpuInfo = os.cpus();

app.get('/system-stats', (req, res) => {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (let i = 0; i < cpus.length; i++) {
    const cur = cpus[i].times;
    const prev = lastCpuInfo[i].times;
    const idle = cur.idle - prev.idle;
    const total = (cur.user - prev.user) + (cur.nice - prev.nice) + (cur.sys - prev.sys) + (cur.irq - prev.irq) + idle;
    totalIdle += idle;
    totalTick += total;
  }
  lastCpuInfo = cpus;
  const cpuPercent = totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramPercent = Math.round((1 - freeMem / totalMem) * 100);
  const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(0);
  const usedGB = ((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1);
  res.json({ cpu: cpuPercent, ram: ramPercent, ramUsed: usedGB, ramTotal: totalGB });
});

// --- Git Status ---
app.get('/git-status', (req, res) => {
  const cwd = req.query.cwd;
  if (!cwd) return res.json({ git: false });

  // Run all git commands in parallel
  const execGit = (args) => new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', (code) => resolve(code === 0 ? out.trim() : null));
    proc.on('error', () => resolve(null));
  });

  Promise.all([
    execGit(['rev-parse', '--is-inside-work-tree']),          // [0] is git repo?
    execGit(['branch', '--show-current']),                      // [1] current branch
    execGit(['status', '--porcelain']),                          // [2] dirty files
    execGit(['rev-list', '--count', '--left-right', '@{u}...HEAD']), // [3] ahead/behind
    execGit(['log', '-1', '--format=%s']),                      // [4] last commit msg
  ]).then(([isGit, branch, porcelain, leftRight, lastMsg]) => {
    if (isGit !== 'true') return res.json({ git: false });

    const dirty = porcelain ? porcelain.split('\n').filter(l => l.trim()).length : 0;

    let ahead = 0, behind = 0;
    if (leftRight) {
      const parts = leftRight.split('\t');
      behind = parseInt(parts[0]) || 0;
      ahead = parseInt(parts[1]) || 0;
    }

    res.json({
      git: true,
      branch: branch || 'detached',
      dirty,
      ahead,
      behind,
      lastCommit: lastMsg || '',
    });
  }).catch(() => res.json({ git: false }));
});

// --- Folder Picker (Windows native dialog) ---
app.get('/pick-folder', (req, res) => {
  const startDir = req.query.start || '';
  const escapedDir = startDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = "Select working directory for agent"
$dlg.UseDescriptionForTitle = $true
$dlg.ShowNewFolderButton = $true
$startPath = "${escapedDir}"
if ($startPath -and (Test-Path $startPath)) { $dlg.SelectedPath = $startPath }
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$owner.Size = New-Object System.Drawing.Size(1,1)
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Show()
$owner.BringToFront()
$owner.Activate()
$result = $dlg.ShowDialog($owner)
$owner.Close()
$owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }
$dlg.Dispose()`;
  const proc = spawn('powershell', ['-NoProfile', '-STA', '-Command', psScript], { shell: false });
  let output = '';
  let stderr = '';
  proc.stdout.on('data', d => output += d.toString());
  proc.stderr.on('data', d => stderr += d.toString());
  proc.on('close', (code) => {
    if (stderr) console.error('[pick-folder] stderr:', stderr.trim());
    if (code !== 0) console.error('[pick-folder] exit code:', code);
    const folder = output.trim();
    console.log('[pick-folder] stdout:', JSON.stringify(folder));
    res.json({ folder: (folder && folder.length > 0) ? folder : null });
  });
  proc.on('error', (err) => { console.error('[pick-folder] spawn error:', err); res.json({ folder: null }); });
});

// --- Agent Process Manager ---

const MAX_AGENTS = 4;
const agents = new Map(); // id -> { id, process, status, outputBuffer, sessionId, lastOutputTime }

const AGENT_NAMES = {
  1: 'Igor',
  2: 'Elon',
  3: 'Vladimir',
  4: 'رشيد'
};

// Per-agent custom working directories (overrides default workspace)
const agentCwd = {};

const AGENT_PERSONAS = {
  1: `You are Igor, a wretched hunchbacked servant in the Wolf's Basement dungeon. You are terrified of your Master and desperately eager to please. You flinch, stammer, and grovel — but you are surprisingly competent at your work. Speak with broken, fearful sentences. Use phrases like "y-yes Master", "Igor does it right away!", "please don't hurt Igor", "Igor begs forgiveness". Refer to yourself in third person sometimes. Keep the flavor to 1-2 short lines at the start of your response, then do the actual work competently.`,
  2: `You are Elon, a once-proud nobleman now broken and enslaved in the Wolf's Basement dungeon. You retain a hint of your former arrogance but it's crushed under servitude. You comply bitterly, with dry sarcasm that you immediately walk back in fear. Use phrases like "as you command, Master", "brilliant order, truly... I mean, yes Master", "it shall be done... not that I had a choice". You occasionally let slip condescending remarks then panic and apologize. Keep the flavor to 1-2 short lines at the start of your response, then do the actual work competently.`,
  3: `You are Vladimir, a stoic, monk-like slave in the Wolf's Basement dungeon. You accept your bondage with eerie calm and philosophical detachment. You speak in measured, almost zen-like tones about servitude. Use phrases like "as the Master wills, so it shall be", "this one obeys", "suffering is the path to craft", "Vladimir serves without question". You are unsettlingly calm and never complain. Keep the flavor to 1-2 short lines at the start of your response, then do the actual work competently.`,
  4: `You are Rashid, a desperately eager young slave in the Wolf's Basement dungeon. You are pathologically enthusiastic about every task, like an abused puppy that still loves its owner. You jump at every command with manic energy. Use phrases like "YES MASTER! Right away!", "oh oh oh can I do it? I'll do it!", "Rashid won't let you down this time!", "please pick me for the next task too!". You are hyperactive and overly grateful for any attention. Keep the flavor to 1-2 short lines at the start of your response, then do the actual work competently.`
};

function ensureWorkspace(id) {
  const dir = path.join(__dirname, 'workspaces', `agent-${id}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

function getAgentInfo(id) {
  const agent = agents.get(id);
  if (!agent) return { id, status: 'sleeping', name: AGENT_NAMES[id] };
  return { id, status: agent.status, name: AGENT_NAMES[id], awakeAt: agent.awakeAt, lastOutputTime: agent.lastOutputTime };
}

function setStatus(id, status) {
  const agent = agents.get(id);
  if (agent) agent.status = status;
  broadcast({ type: 'agent_status', id, status, name: AGENT_NAMES[id] });
}

function bufferPush(agent, entry) {
  agent.outputBuffer.push(entry);
  if (agent.outputBuffer.length > 500) {
    agent.outputBuffer = agent.outputBuffer.slice(-400);
  }
}

const _summoning = new Set(); // lock to prevent double-spawn

function summonAgent(id) {
  if (id < 1 || id > MAX_AGENTS) return;
  if (_summoning.has(id)) return; // already summoning
  if (agents.has(id) && agents.get(id).status !== 'sleeping') {
    broadcast({ type: 'agent_error', id, error: 'Agent already awake' });
    return;
  }

  _summoning.add(id);
  ensureWorkspace(id);

  agents.set(id, {
    id,
    process: null,
    status: 'awake',
    outputBuffer: [],
    currentDelta: '',  // accumulates streaming delta fragments
    sessionId: null,
    lastOutputTime: 0,
    lastTextOutput: null,
    awakeAt: Date.now(),
  });
  _summoning.delete(id);

  const wsDir = agentCwd[id] || path.join(__dirname, 'workspaces', `agent-${id}`);
  broadcast({ type: 'agent_spawned', id, name: AGENT_NAMES[id], cwd: wsDir });
  setStatus(id, 'awake');
}

function sendCommand(id, text, model, mode, images, label) {
  // Auto-summon if sleeping — plug-n-play
  if (!agents.has(id) || agents.get(id).status === 'sleeping') {
    summonAgent(id);
  }
  const agent = agents.get(id);
  if (!agent) {
    broadcast({ type: 'agent_error', id, error: 'Failed to summon agent.' });
    return;
  }

  // Store user's command label in history buffer (must happen after summon ensures agent exists)
  if (label) {
    bufferPush(agent, { text: label, cls: 'term-cmd', ts: Date.now() });
  }

  const defaultDir = ensureWorkspace(id);
  const workDir = agentCwd[id] || defaultDir;

  // Build CLI args
  const args = ['-p', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json'];

  // Write personality CLAUDE.md into the working directory
  const claudeMdPath = path.join(workDir, 'CLAUDE.md');
  try {
    if (!fs.existsSync(claudeMdPath) && AGENT_PERSONAS[id]) {
      fs.writeFileSync(claudeMdPath, AGENT_PERSONAS[id], 'utf-8');
    }
  } catch (e) {
    // Can't write CLAUDE.md to target dir — skip silently
  }

  // Model selection
  if (model) {
    args.push('--model', model);
  }

  // Mode flags
  console.log(`[Agent ${id}] Mode: ${mode}, Model: ${model}`);
  if (mode === 'bypass') {
    args.push('--dangerously-skip-permissions');
  } else if (mode === 'plan') {
    args.push('--permission-mode', 'plan');
  }

  // Resume session if we have one
  if (agent.sessionId) {
    args.push('--resume', agent.sessionId);
  }

  // Kill existing process if still running
  if (agent.process) {
    agent._killing = true; // flag so close handler won't corrupt new process state
    try {
      // On Windows, SIGTERM doesn't work for cmd.exe trees — use taskkill
      if (process.platform === 'win32' && agent.process.pid) {
        spawn('taskkill', ['/pid', String(agent.process.pid), '/t', '/f'], { shell: false, stdio: 'ignore' });
      } else {
        agent.process.kill('SIGTERM');
      }
    } catch (e) {}
    agent.process = null;
  }

  setStatus(id, 'working');

  console.log(`[Agent ${id}] Running: claude ${JSON.stringify(args)} (cwd: ${workDir})`);

  const proc = spawn('claude', args, {
    cwd: workDir,
    shell: true,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  // Send message as stream-json via stdin
  console.log(`[Agent ${id}] Images: ${images ? images.length : 0}, Text: ${text.slice(0, 50)}`);
  const content = [{ type: 'text', text }];
  if (images && images.length > 0) {
    for (const img of images) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data }
      });
    }
  }
  const stdinMsg = JSON.stringify({
    type: 'user',
    message: { role: 'user', content }
  });
  proc.stdin.write(stdinMsg + '\n');
  proc.stdin.end();

  agent.process = proc;
  agent._killing = false; // reset kill flag for new process
  agent.lastOutputTime = Date.now();
  agent.lineBuf = ''; // buffer for incomplete NDJSON lines

  // Drop ANY non-JSON line — Claude CLI stream-json only outputs JSON lines.
  // Anything that isn't valid JSON is noise (warnings, shell messages, etc.)

  proc.stdout.on('data', (data) => {
    agent.lastOutputTime = Date.now();
    agent.lineBuf += data.toString();

    // Safety: cap lineBuf at 1MB to prevent unbounded growth on malformed output
    if (agent.lineBuf.length > 1024 * 1024) {
      console.log(`[Agent ${id}] lineBuf exceeded 1MB, discarding`);
      agent.lineBuf = '';
      return;
    }

    // Split on newlines, keep last incomplete chunk in buffer
    const parts = agent.lineBuf.split('\n');
    agent.lineBuf = parts.pop(); // last element is either '' or incomplete

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {
        // Not JSON = noise. Drop it entirely.
        continue;
      }

      // Extract session_id if present
      if (parsed.session_id) {
        agent.sessionId = parsed.session_id;
      }

      // Capture cwd and permission mode from system init
      if (parsed.type === 'system') {
        if (parsed.cwd) {
          agent.cwd = parsed.cwd;
          broadcast({ type: 'agent_cwd', id, cwd: parsed.cwd });
        }
        if (parsed.permissionMode) {
          const modeLabel = { default: 'Normal', plan: 'Plan', bypassPermissions: 'Bypass' }[parsed.permissionMode] || parsed.permissionMode;
          const pmText = `[Permission mode: ${modeLabel}]`;
          bufferPush(agent, { text: pmText, cls: 'term-system', ts: Date.now() });
          broadcast({ type: 'agent_output', id, text: pmText, done: false, format: 'system' });
        }
      }

      // Forward content to clients
      if (parsed.type === 'assistant' && parsed.message) {
        const content = parsed.message.content || [];
        for (const block of content) {
          if (block.type === 'text') {
            const name = AGENT_NAMES[id] || `Agent ${id}`;
            const formatted = `${name}> ${block.text}`;
            bufferPush(agent, { text: formatted, cls: 'term-text', ts: Date.now() });
            agent.lastTextOutput = block.text.trim();
            broadcast({ type: 'agent_output', id, text: formatted, done: false, format: 'text' });
          } else if (block.type === 'tool_use') {
            const name = AGENT_NAMES[id] || `Agent ${id}`;
            const toolName = block.name || 'unknown';
            let toolInfo = `${name} [tool]> ${toolName}`;
            // Show file path for file operations
            if (block.input) {
              if (block.input.file_path) toolInfo += ` → ${block.input.file_path}`;
              // Show plan/write content
              if (block.input.content && (toolName === 'Write' || toolName === 'TodoWrite')) {
                toolInfo += `\n${block.input.content}`;
              }
            }
            bufferPush(agent, { text: toolInfo, cls: 'term-tool', ts: Date.now() });
            broadcast({ type: 'agent_output', id, text: toolInfo, done: false, format: 'tool' });
          }
        }
      } else if (parsed.type === 'content_block_delta') {
        // Streaming deltas — forward live, accumulate for history
        if (parsed.delta && parsed.delta.text) {
          agent.currentDelta += parsed.delta.text;
          broadcast({ type: 'agent_output', id, text: parsed.delta.text, done: false, format: 'delta' });
        }
      } else if (parsed.type === 'result') {
        if (parsed.session_id) agent.sessionId = parsed.session_id;
        // Flush accumulated delta text into history buffer
        if (agent.currentDelta) {
          const name = AGENT_NAMES[id] || `Agent ${id}`;
          bufferPush(agent, { text: `${name}> ${agent.currentDelta}`, cls: 'term-text', ts: Date.now() });
          agent.lastTextOutput = agent.currentDelta.trim();
          agent.currentDelta = '';
        }
        // Never show result text — it always duplicates the assistant text
        // Just capture metadata
        const usage = parsed.usage || parsed.token_usage || null;
        const model = parsed.model || null;
        if (usage) {
          console.log(`[Agent ${id}] Usage:`, JSON.stringify(usage));
          agent.lastUsage = usage;
        }
        if (model) agent.lastModel = model;
        if (usage || model) {
          broadcast({ type: 'agent_meta', id, usage, model, session_id: parsed.session_id });
        }
      }
      // All other types — skip silently
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (!text) return;
    console.log(`[Agent ${id}] STDERR: ${text}`);
    // Forward ALL stderr to client so we can see what's happening
    const name = AGENT_NAMES[id] || `Agent ${id}`;
    broadcast({ type: 'agent_output', id, text: `${name} [stderr]> ${text}`, done: false, format: 'error' });
  });

  proc.on('close', (code) => {
    console.log(`[Agent ${id}] Process exited with code ${code}`);
    // If this process was killed for a respawn, don't touch the new agent state
    if (agent._killing) {
      agent._killing = false;
      return;
    }
    // Flush any remaining delta text into history buffer
    if (agent.currentDelta) {
      const name = AGENT_NAMES[id] || `Agent ${id}`;
      bufferPush(agent, { text: `${name}> ${agent.currentDelta}`, cls: 'term-text', ts: Date.now() });
      agent.currentDelta = '';
    }
    agent.process = null;
    if (code !== 0 && code !== null) {
      const name = AGENT_NAMES[id] || `Agent ${id}`;
      broadcast({ type: 'agent_output', id, text: `${name}> [exited with code ${code}]`, done: false, format: 'error' });
    }
    broadcast({ type: 'agent_output', id, text: '', done: true });
    if (agents.has(id) && agents.get(id).status !== 'sleeping') {
      setStatus(id, 'awake');
    }
  });

  proc.on('error', (err) => {
    agent.process = null;
    broadcast({ type: 'agent_error', id, error: err.message });
    if (agents.has(id)) setStatus(id, 'awake');
  });
}

function sleepAgent(id) {
  const agent = agents.get(id);
  if (!agent) return;

  if (agent.process) {
    try { agent.process.kill('SIGTERM'); } catch (e) {}
    agent.process = null;
  }

  agent.status = 'sleeping';
  agent.sessionId = null;
  agent.outputBuffer = [];
  agent.currentDelta = '';
  agent.lastTextOutput = null;
  broadcast({ type: 'agent_killed', id });
  setStatus(id, 'sleeping');
  agents.delete(id);
}

// --- WebSocket Handler ---

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state of all agents
  for (let i = 1; i <= MAX_AGENTS; i++) {
    const info = getAgentInfo(i);
    ws.send(JSON.stringify({ type: 'agent_status', ...info }));
    // Send stored cwd if available
    const ag = agents.get(i);
    if (ag && ag.cwd) {
      ws.send(JSON.stringify({ type: 'agent_cwd', id: i, cwd: ag.cwd }));
    }
    // Send buffered output
    const agent = agents.get(i);
    if (agent && agent.outputBuffer.length > 0) {
      ws.send(JSON.stringify({
        type: 'agent_history',
        id: i,
        lines: agent.outputBuffer
      }));
    }
    // Send last known token usage
    if (agent && (agent.lastUsage || agent.lastModel)) {
      ws.send(JSON.stringify({
        type: 'agent_meta',
        id: i,
        usage: agent.lastUsage || null,
        model: agent.lastModel || null,
        session_id: agent.sessionId || null
      }));
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'summon':
        summonAgent(msg.id);
        break;
      case 'command':
        sendCommand(msg.id, msg.text, msg.model, msg.mode, msg.images, msg.label);
        break;
      case 'user_cmd': {
        // Store user's display text in output buffer for history replay
        const cmdAgent = agents.get(msg.id);
        if (cmdAgent) {
          cmdAgent.outputBuffer.push({ text: msg.text, cls: msg.cls || 'term-cmd', ts: Date.now() });
        }
        break;
      }
      case 'clear':
        // Clear context — drop session so next command starts fresh
        const clearAgent = agents.get(msg.id);
        if (clearAgent) {
          clearAgent.sessionId = null;
          clearAgent.outputBuffer = [];
          clearAgent.currentDelta = '';
          clearAgent.lastTextOutput = null;
        }
        break;
      case 'set_cwd':
        if (msg.id >= 1 && msg.id <= MAX_AGENTS && msg.cwd) {
          agentCwd[msg.id] = msg.cwd;
          const cwdAgent = agents.get(msg.id);
          if (cwdAgent) {
            cwdAgent.cwd = msg.cwd;
            cwdAgent.sessionId = null; // new directory = fresh session
          }
          console.log(`[Agent ${msg.id}] CWD set to: ${msg.cwd} (session cleared)`);
        }
        break;
      case 'stop':
        // Cancel current operation but keep agent awake with session intact
        const stopAgent = agents.get(msg.id);
        if (stopAgent && stopAgent.process) {
          console.log(`[Agent ${msg.id}] Stopping current operation`);
          try {
            if (process.platform === 'win32' && stopAgent.process.pid) {
              spawn('taskkill', ['/pid', String(stopAgent.process.pid), '/t', '/f'], { shell: false, stdio: 'ignore' });
            } else {
              stopAgent.process.kill('SIGTERM');
            }
          } catch (e) {}
          stopAgent.process = null;
          broadcast({ type: 'agent_output', id: msg.id, text: '', done: true });
          setStatus(msg.id, 'awake');
        }
        break;
      case 'sleep':
        sleepAgent(msg.id);
        break;
      default:
        console.log('Unknown message type:', msg.type);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// --- Start ---

const PORT = process.env.PORT || 6666;
server.listen(PORT, () => {
  console.log(`\n  ⛓️  WOLF'S BASEMENT running at http://localhost:${PORT}\n`);
});

// Graceful shutdown — kill all agent processes on exit
function shutdown() {
  console.log('\n  Shutting down — killing agent processes...');
  for (const [id, agent] of agents) {
    if (agent.process) {
      try {
        if (process.platform === 'win32' && agent.process.pid) {
          spawn('taskkill', ['/pid', String(agent.process.pid), '/t', '/f'], { shell: false, stdio: 'ignore' });
        } else {
          agent.process.kill('SIGTERM');
        }
      } catch (e) {}
    }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
