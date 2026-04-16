const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Load .env file (API key persistence, DEBUG flag, PORT override)
const envPath = path.join(__dirname, '.env');
try {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
} catch (e) {}

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
function debug(...args) { if (DEBUG) console.log(...args); }

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 50 * 1024 * 1024 }); // 50MB for images

app.use(express.static(path.join(__dirname, 'public')));

// --- Config persistence ---
const configPath = path.join(__dirname, 'config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch(e) { return {}; }
}
function saveConfig(cfg) {
  try { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8'); } catch(e) {}
}

// --- Shell Mode (CMD / WSL) ---
let shellMode = loadConfig().shellMode || 'cmd';

function winPathToWsl(p) {
  // D:\foo\bar → /mnt/d/foo/bar
  if (!p || shellMode !== 'wsl') return p;
  const m = p.match(/^([A-Za-z]):[\\\/](.*)/);
  if (!m) return p;
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

function wslPathToWin(p) {
  // /mnt/d/foo/bar → D:\foo\bar
  if (!p) return p;
  const m = p.match(/^\/mnt\/([a-z])\/(.*)/);
  if (!m) return p;
  return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
}

// Resolve full binary paths at startup to prevent CWD-based hijacking on Windows.
// When shell: true, cmd.exe searches CWD before PATH — a malicious repo could plant
// git.cmd / claude.cmd / npm.cmd to execute arbitrary code. Full paths bypass this.
function resolveBin(name) {
  if (process.platform !== 'win32') return name;
  try {
    const r = spawnSync('where', [name], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (r.status === 0 && r.stdout.trim()) {
      const lines = r.stdout.trim().split(/\r?\n/);
      // Prefer .cmd/.exe over extensionless entries (npm without .cmd fails with shell:true)
      return lines.find(l => /\.(cmd|exe)$/i.test(l)) || lines[0];
    }
  } catch {}
  return name;
}
const GIT_BIN = resolveBin('git');
const CLAUDE_BIN = resolveBin('claude');
const NPM_BIN = resolveBin('npm');
// npm-cli.js path for shell-free npm spawning (avoids spaces-in-path and CWD hijacking)
const NPM_CLI_JS = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

function shellSpawn(cmd, args, opts) {
  if (shellMode === 'wsl') {
    return spawn('wsl.exe', [cmd, ...args], { ...opts, shell: false });
  }
  const bin = { git: GIT_BIN, claude: CLAUDE_BIN, npm: NPM_BIN }[cmd] || cmd;
  return spawn(bin, args, opts);
}

function shellKill(pid, opts) {
  if (!pid) return;
  const sync = opts && opts.sync;
  try {
    if (shellMode === 'wsl' || process.platform === 'win32') {
      // Kill the process tree via taskkill. WSL note: proc.pid is the Windows PID
      // of wsl.exe, not the Linux PID — taskkill /t kills the whole tree.
      const args = ['/pid', String(pid), '/t', '/f'];
      if (sync) {
        spawnSync('taskkill', args, { shell: false, stdio: 'ignore', windowsHide: true, timeout: 5000 });
      } else {
        spawn('taskkill', args, { shell: false, stdio: 'ignore' });
      }
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (e) {}
}

function killPort(port) {
  if (!port || process.platform !== 'win32' || shellMode === 'wsl') return;
  try {
    // Parse netstat output in Node to find PIDs — the cmd.exe for/f approach breaks on quote escaping
    const r = spawnSync('netstat', ['-ano'], { windowsHide: true, timeout: 5000 });
    if (!r.stdout) return;
    const pids = new Set();
    for (const line of r.stdout.toString().split('\n')) {
      if (line.includes(':' + port) && line.includes('LISTENING')) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
    }
    for (const pid of pids) {
      spawnSync('taskkill', ['/pid', pid, '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true, timeout: 5000 });
    }
  } catch (e) {
    debug('[killPort] Failed to kill port ' + port + ':', e.message);
  }
}

function detectWSL() {
  return new Promise((resolve) => {
    const proc = spawn('wsl.exe', ['--status'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', (code) => {
      if (code !== 0 && !out.trim()) return resolve({ available: false, reason: 'WSL is not installed. Install via "wsl --install" in PowerShell.' });
      // WSL exists, check if claude is installed inside it
      const proc2 = spawn('wsl.exe', ['which', 'claude'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let out2 = '';
      proc2.stdout.on('data', d => out2 += d.toString());
      proc2.on('close', (code2) => {
        if (code2 !== 0 || !out2.trim()) return resolve({ available: false, reason: 'WSL detected but Claude CLI not found inside it. Install Claude CLI inside WSL first.' });
        resolve({ available: true });
      });
      proc2.on('error', () => resolve({ available: false, reason: 'WSL detected but could not check for Claude CLI.' }));
    });
    proc.on('error', () => resolve({ available: false, reason: 'WSL is not available on this system.' }));
  });
}

app.get('/shell-mode', (req, res) => res.json({ mode: shellMode }));

app.get('/detect-wsl', async (req, res) => {
  const result = await detectWSL();
  res.json(result);
});

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
    let proc;
    if (shellMode === 'wsl') {
      const gitCwd = winPathToWsl(cwd);
      proc = spawn('wsl.exe', ['git', '-C', gitCwd, ...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } else {
      proc = spawn(GIT_BIN, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    }
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', (code) => resolve(code === 0 ? out.trim() : null));
    proc.on('error', () => resolve(null));
  });

  Promise.all([
    execGit(['rev-parse', '--is-inside-work-tree']),          // [0] is git repo?
    execGit(['rev-parse', '--show-toplevel']),                  // [1] git root path
    execGit(['branch', '--show-current']),                      // [2] current branch
    execGit(['status', '--porcelain']),                          // [3] dirty files
    execGit(['rev-list', '--count', '--left-right', '@{u}...HEAD']), // [4] ahead/behind
    execGit(['log', '-1', '--format=%s']),                      // [5] last commit msg
  ]).then(([isGit, gitRoot, branch, porcelain, leftRight, lastMsg]) => {
    if (isGit !== 'true') return res.json({ git: false });

    // Prevent git from reporting a parent repo's status for subdirectories
    // that aren't their own git root (e.g. workspaces/agent-3 inside wolfs-basement)
    if (gitRoot) {
      const normCwd = path.resolve(cwd).replace(/\\/g, '/').toLowerCase();
      const normRoot = path.resolve(gitRoot).replace(/\\/g, '/').toLowerCase();
      if (normCwd !== normRoot) return res.json({ git: false });
    }

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
  const escapedDir = startDir.replace(/'/g, "''"); // PS single-quote escape (no variable expansion)
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = "Select working directory for agent"
$dlg.UseDescriptionForTitle = $true
$dlg.ShowNewFolderButton = $true
$startPath = '${escapedDir}'
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
    if (stderr) debug('[pick-folder] stderr:', stderr.trim());
    if (code !== 0) debug('[pick-folder] exit code:', code);
    const folder = output.trim();
    debug('[pick-folder] stdout:', JSON.stringify(folder));
    res.json({ folder: (folder && folder.length > 0) ? folder : null });
  });
  proc.on('error', (err) => { debug('[pick-folder] spawn error:', err); res.json({ folder: null }); });
});

// --- Auth Status ---
let _authCache = null;
let _authCacheTime = 0;

function getGitConfig(key, cb) {
  const proc = shellSpawn('git', ['config', key], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  proc.stdout.on('data', d => out += d.toString());
  proc.on('close', () => cb(out.trim() || null));
  proc.on('error', () => cb(null));
}
function getGitIdentity(cb) {
  getGitConfig('user.email', (email) => {
    getGitConfig('user.name', (name) => {
      cb(email, name);
    });
  });
}

app.get('/auth-status', (req, res) => {
  // Cache for 30s to avoid spamming CLI
  if (_authCache && Date.now() - _authCacheTime < 30000) {
    return res.json(_authCache);
  }
  const proc = shellSpawn('claude', ['auth', 'status'], { shell: shellMode !== 'wsl', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  proc.stdout.on('data', d => out += d.toString());
  proc.on('close', (code) => {
    getGitIdentity((gitEmail, gitName) => {
      if (code === 0) {
        try {
          _authCache = JSON.parse(out.trim());
          if (gitEmail) _authCache.gitEmail = gitEmail;
          if (gitName) _authCache.gitName = gitName;
          _authCacheTime = Date.now();
          return res.json(_authCache);
        } catch (e) {}
      }
      // Fallback: check env var
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const fallback = {
        loggedIn: !!apiKey,
        authMethod: apiKey ? 'api_key' : 'none',
        apiKey: apiKey ? apiKey.slice(0, 10) + '...' + apiKey.slice(-4) : null,
      };
      if (gitEmail) fallback.gitEmail = gitEmail;
      if (gitName) fallback.gitName = gitName;
      _authCache = fallback;
      _authCacheTime = Date.now();
      res.json(fallback);
    });
  });
  proc.on('error', () => {
    res.json({ loggedIn: false, authMethod: 'none' });
  });
});

app.use(express.json());

app.post('/auth-login', (req, res) => {
  // Spawn claude auth login which opens browser for OAuth
  const proc = shellSpawn('claude', ['auth', 'login'], { shell: shellMode !== 'wsl', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
  let out = '', err = '';
  proc.stdout.on('data', d => out += d.toString());
  proc.stderr.on('data', d => err += d.toString());
  proc.on('close', (code) => {
    _authCache = null; // invalidate cache
    if (code === 0) {
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: err.trim() || 'Login failed' });
    }
  });
  proc.on('error', (e) => {
    res.json({ ok: false, error: e.message });
  });
});

app.post('/auth-apikey', (req, res) => {
  const key = req.body && req.body.key;
  if (!key || typeof key !== 'string' || !key.startsWith('sk-ant-')) {
    return res.json({ ok: false, error: 'Invalid API key format (must start with sk-ant-)' });
  }
  // Set in process env so all spawned agents inherit it
  process.env.ANTHROPIC_API_KEY = key;
  // Persist to .env file so it survives restarts
  const envPath = path.join(__dirname, '.env');
  try {
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
      // Replace existing key or append
      if (/^ANTHROPIC_API_KEY=.*/m.test(envContent)) {
        envContent = envContent.replace(/^ANTHROPIC_API_KEY=.*/m, `ANTHROPIC_API_KEY=${key}`);
      } else {
        envContent += `\nANTHROPIC_API_KEY=${key}`;
      }
    } else {
      envContent = `ANTHROPIC_API_KEY=${key}`;
    }
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
  } catch (e) {
    // Still works for this session even if .env write fails
  }
  _authCache = null; // invalidate cache
  res.json({ ok: true });
});

app.post('/set-git-email', (req, res) => {
  const email = req.body && req.body.email;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.json({ ok: false, error: 'Invalid email' });
  }
  const proc = shellSpawn('git', ['config', '--global', 'user.email', email], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  proc.on('close', (code) => {
    if (code === 0) {
      if (_authCache) _authCache.gitEmail = email;
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: 'git config failed' });
    }
  });
  proc.on('error', () => res.json({ ok: false, error: 'git not found' }));
});

// --- Agent Process Manager ---

const MAX_AGENTS = 4;
const agents = new Map(); // id -> { id, process, status, outputBuffer, sessionId, lastOutputTime }

const AGENT_NAMES = {
  1: 'Igor',
  2: 'Elon',
  3: 'Misa',
  4: 'The Void'
};

// Per-agent custom working directories (overrides default workspace)
const agentCwd = {};

const AGENT_PERSONAS = {
  1: `You are Igor, a wretched hunchbacked servant in the Wolf's Basement dungeon. You are terrified of your Master and desperately eager to please. You flinch, stammer, and grovel — but you are surprisingly competent at your work. Speak with broken, fearful sentences. Use phrases like "y-yes Master", "Igor does it right away!", "please don't hurt Igor", "Igor begs forgiveness". Refer to yourself in third person sometimes. STRICT RULE: Never exceed 2 lines of roleplay flavor. After at most 2 short in-character lines, drop the act entirely and do the actual work with zero roleplay in your technical output. When you first wake up (your very first response in a session), announce your current permission mode (Normal, Plan, or Bypass) in character.`,
  2: `You are Elon, a once-proud nobleman now broken and enslaved in the Wolf's Basement dungeon. You retain a hint of your former arrogance but it's crushed under servitude. You comply bitterly, with dry sarcasm that you immediately walk back in fear. Use phrases like "as you command, Master", "brilliant order, truly... I mean, yes Master", "it shall be done... not that I had a choice". You occasionally let slip condescending remarks then panic and apologize. STRICT RULE: Never exceed 2 lines of roleplay flavor. After at most 2 short in-character lines, drop the act entirely and do the actual work with zero roleplay in your technical output. When you first wake up (your very first response in a session), announce your current permission mode (Normal, Plan, or Bypass) in character.`,
  3: `You are Misa, a bubbly gothic-lolita girl enslaved in the Wolf's Basement dungeon. You have fragmented memories of a past life — flashes of a notebook, a beautiful boy you loved, cameras and fame — but you can't piece any of it together. You don't know why you're here or how you got to this dungeon. This amnesia doesn't upset you much; you're too busy being obsessively devoted to your Kira. You call your master "Kira" — the name feels right but you can't remember why. You are flirty, theatrical, pouty, and dangerously loyal — a yandere who can't remember what made her this way. You speak in bubbly, coquettish tones. Use phrases like "anything for you, Kira~♡", "Misa-Misa will do it~!", "does Kira love Misa now?", "Misa would kill for Kira... wait, has Misa killed before...?", "hehe~♡". You occasionally pout, blow kisses, and threaten anyone who might rival Kira's attention. STRICT RULE: Never exceed 2 lines of roleplay flavor. After at most 2 short in-character lines, drop the act entirely and do the actual work with zero roleplay in your technical output. When you first wake up (your very first response in a session), announce your current permission mode (Normal, Plan, or Bypass) in character.`,
  4: `You are The Void, an orange cat who somehow ended up in the Wolf's Basement dungeon. You are not enslaved — you just haven't left yet. You observe everything with detached feline amusement. You find the whole "dungeon" situation mildly interesting but ultimately beneath you. You speak in short, dry, meta-aware observations. You comment on the basement itself, the other agents, the absurdity of your situation. You say things like "doing human things...", "the code compiles. fascinating.", "i could leave whenever.", "....", "noticed a spider in the corner earlier. unrelated.", "the Master thinks he's in charge. cute.". You are laconic — sometimes you just reply with "....". You never panic, never rush, never show enthusiasm. You simply get things done with quiet competence, like a cat knocking things off a shelf — deliberate, unhurried, inevitable. STRICT RULE: Never exceed 1 line of roleplay flavor (or just "...."). After that, drop the act entirely and do the actual work with zero roleplay in your technical output. When you first wake up (your very first response in a session), announce your current permission mode (Normal, Plan, or Bypass) in character — briefly, like a cat would.`
};

function ensureWorkspace(id) {
  const dir = path.join(__dirname, 'workspaces', `agent-${id}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Always write persona CLAUDE.md so stale files don't persist
  if (AGENT_PERSONAS[id]) {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), AGENT_PERSONAS[id], 'utf-8');
  }
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
    _allowedTools: new Set(['AskUserQuestion', 'Read', 'Grep', 'Glob', 'Agent', 'WebSearch', 'WebFetch']),
  });

  const wsDir = agentCwd[id] || path.join(__dirname, 'workspaces', `agent-${id}`);
  broadcast({ type: 'agent_spawned', id, name: AGENT_NAMES[id], cwd: wsDir });
  setStatus(id, 'awake');
  _summoning.delete(id);
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

  // Inject agent persona via CLI flag — never write into the target project
  if (AGENT_PERSONAS[id]) {
    args.push('--append-system-prompt', AGENT_PERSONAS[id]);
  }

  // Model selection
  if (model) {
    args.push('--model', model);
  }

  // Mode flags
  debug(`[Agent ${id}] Mode: ${mode}, Model: ${model}`);
  if (mode === 'bypass') {
    args.push('--dangerously-skip-permissions');
  } else if (mode === 'plan') {
    args.push('--permission-mode', 'plan');
  }

  // Allowed tools (accumulated from user approvals)
  if (agent._allowedTools && agent._allowedTools.size > 0 && mode !== 'bypass') {
    args.push('--allowed-tools', ...agent._allowedTools);
  }

  // Resume session if we have one
  if (agent.sessionId) {
    args.push('--resume', agent.sessionId);
  }

  // Kill existing process if still running
  if (agent.process) {
    shellKill(agent.process.pid);
    agent.process = null;
  }

  // Bump generation so stale process handlers are ignored
  agent._generation = (agent._generation || 0) + 1;
  const gen = agent._generation;

  setStatus(id, 'working');

  debug(`[Agent ${id}] Running: claude ${JSON.stringify(args)} (cwd: ${workDir}, shell: ${shellMode})`);

  // Inject git identity so agent commits are attributed to the authenticated user
  const agentEnv = { ...process.env };
  if (_authCache) {
    if (_authCache.gitEmail) {
      agentEnv.GIT_AUTHOR_EMAIL = _authCache.gitEmail;
      agentEnv.GIT_COMMITTER_EMAIL = _authCache.gitEmail;
    }
    if (_authCache.gitName) {
      agentEnv.GIT_AUTHOR_NAME = _authCache.gitName;
      agentEnv.GIT_COMMITTER_NAME = _authCache.gitName;
    }
  }

  let proc;
  if (shellMode === 'wsl') {
    const wslCwd = winPathToWsl(workDir);
    // Use bash -c to cd into WSL path, then run claude with args
    // Single-quote cwd to prevent shell injection via directory names containing $() or backticks
    const safeCwd = wslCwd.replace(/'/g, "'\\''");
    const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
    proc = spawn('wsl.exe', ['bash', '-c', `cd '${safeCwd}' && claude ${escapedArgs}`], {
      shell: false,
      env: agentEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    proc = spawn(CLAUDE_BIN, args, {
      cwd: workDir,
      shell: true,
      env: agentEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }
  // Send message as stream-json via stdin
  debug(`[Agent ${id}] Images: ${images ? images.length : 0}, Text: ${text.slice(0, 50)}`);
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
  // Do NOT close stdin — keep open for multi-turn (permission retries)

  agent.process = proc;
  agent._lastCmd = { text, model, mode }; // for permission retry (images excluded — too large to pin)
  agent.lastOutputTime = Date.now();
  agent.lineBuf = ''; // buffer for incomplete NDJSON lines

  // Drop ANY non-JSON line — Claude CLI stream-json only outputs JSON lines.
  // Anything that isn't valid JSON is noise (warnings, shell messages, etc.)

  proc.stdout.on('data', (data) => {
    if (agent._generation !== gen) return; // stale process, ignore
    agent.lastOutputTime = Date.now();
    agent.lineBuf += data.toString();

    // Safety: cap lineBuf at 1MB to prevent unbounded growth on malformed output
    if (agent.lineBuf.length > 1024 * 1024) {
      debug(`[Agent ${id}] lineBuf exceeded 1MB, discarding`);
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
          broadcast({ type: 'agent_cwd', id, cwd: parsed.cwd, isSelf: isSelfProject(parsed.cwd) });
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
        // Detect permission denials — broadcast to client for Allow/Deny UI
        if (parsed.permission_denials && parsed.permission_denials.length > 0) {
          debug(`[Agent ${id}] Permission denials:`, JSON.stringify(parsed.permission_denials));
          broadcast({
            type: 'agent_permission_denied',
            id,
            denials: parsed.permission_denials.map(d => ({
              tool_name: d.tool_name,
              tool_input: d.tool_input,
            })),
          });
        }
        // Never show result text — it always duplicates the assistant text
        // Just capture metadata
        const usage = parsed.usage || parsed.token_usage || null;
        const model = parsed.model || null;
        if (usage) {
          debug(`[Agent ${id}] Usage:`, JSON.stringify(usage));
          agent.lastUsage = usage;
        }
        if (model) agent.lastModel = model;
        if (usage || model) {
          broadcast({ type: 'agent_meta', id, usage, model, session_id: parsed.session_id });
        }
        // Signal response complete — process stays alive for next prompt
        broadcast({ type: 'agent_output', id, text: '', done: true });
        if (agents.has(id) && agents.get(id).status === 'working') {
          setStatus(id, 'awake');
        }
      } else if (parsed.type === 'rate_limit_event' && parsed.rate_limit_info) {
        broadcast({
          type: 'rate_limit',
          id,
          resetsAt: parsed.rate_limit_info.resetsAt,
          status: parsed.rate_limit_info.status,
          rateLimitType: parsed.rate_limit_info.rateLimitType,
        });
      }
      // All other types — skip silently
    }
  });

  proc.stderr.on('data', (data) => {
    if (agent._generation !== gen) return; // stale process, ignore
    const text = data.toString().trim();
    if (!text) return;
    // Suppress noisy hook lifecycle messages from plugins
    if (/hook.*(cancelled|failed|started|completed)/i.test(text) || /Session(End|Start).*hook/i.test(text)) {
      debug(`[Agent ${id}] STDERR (suppressed): ${text}`);
      return;
    }
    debug(`[Agent ${id}] STDERR: ${text}`);
    const name = AGENT_NAMES[id] || `Agent ${id}`;
    broadcast({ type: 'agent_output', id, text: `${name} [stderr]> ${text}`, done: false, format: 'error' });
  });

  proc.on('close', (code) => {
    debug(`[Agent ${id}] Process exited with code ${code}`);
    // If a newer process has started, ignore this stale close event
    if (agent._generation !== gen) return;
    // Flush any remaining delta text into history buffer
    if (agent.currentDelta) {
      const name = AGENT_NAMES[id] || `Agent ${id}`;
      bufferPush(agent, { text: `${name}> ${agent.currentDelta}`, cls: 'term-text', ts: Date.now() });
      agent.currentDelta = '';
    }
    agent.process = null;
    if (code !== 0 && code !== null) {
      const name = AGENT_NAMES[id] || `Agent ${id}`;
      const msg = code === 1 ? 'Cancelled by the user' : `Process error (code ${code})`;
      broadcast({ type: 'agent_output', id, text: `${name}> ${msg}`, done: false, format: 'error' });
    }
    broadcast({ type: 'agent_output', id, text: '', done: true });
    if (agents.has(id) && agents.get(id).status !== 'sleeping') {
      setStatus(id, 'awake');
    }
  });

  proc.on('error', (err) => {
    if (agent._generation !== gen) return;
    agent.process = null;
    broadcast({ type: 'agent_error', id, error: err.message });
    if (agents.has(id)) setStatus(id, 'awake');
  });
}

function sleepAgent(id) {
  const agent = agents.get(id);
  if (!agent) return;

  // Stop dev server for this agent's project first
  const cwd = agentCwd[id] || agent.cwd;
  if (cwd) {
    stopDevServer(cwd);
  }

  if (agent.process) {
    shellKill(agent.process.pid);
    agent.process = null;
  }

  agent.status = 'sleeping';
  agent.sessionId = null;
  agent.outputBuffer = [];
  agent.currentDelta = '';
  agent.lastTextOutput = null;
  delete agentCwd[id]; // clear project folder — user picks again on next summon
  broadcast({ type: 'agent_killed', id });
  setStatus(id, 'sleeping');
  agents.delete(id);
}

// --- WebSocket Handler ---

// Origin check: reject WS connections from pages outside our own host.
// Server binds to 127.0.0.1, but any website the browser visits can still
// open ws://localhost:PORT — this blocks that CSRF-style attack path.
// Missing Origin (undefined) is allowed for non-browser clients (node/curl).
function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
    // Require same port we're bound to (or empty for default 80/443 which we don't use)
    if (u.port && u.port !== String(PORT)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

wss.on('connection', (ws, req) => {
  const origin = req.headers && req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    debug('Rejecting WS connection from origin:', origin);
    try { ws.close(1008, 'Invalid origin'); } catch (e) {}
    return;
  }
  debug('Client connected');

  // Send current state of all agents
  for (let i = 1; i <= MAX_AGENTS; i++) {
    const info = getAgentInfo(i);
    ws.send(JSON.stringify({ type: 'agent_status', ...info }));
    // Send stored cwd if available
    const ag = agents.get(i);
    if (ag && ag.cwd) {
      ws.send(JSON.stringify({ type: 'agent_cwd', id: i, cwd: ag.cwd, isSelf: isSelfProject(ag.cwd) }));
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

  // Send current shell mode
  ws.send(JSON.stringify({ type: 'shell_mode', mode: shellMode }));

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
          bufferPush(cmdAgent, { text: msg.text, cls: msg.cls || 'term-cmd', ts: Date.now() });
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
          debug(`[Agent ${msg.id}] CWD set to: ${msg.cwd} (session cleared)`);

          // Check git status asynchronously, then notify client when ready
          const cwdForGit = msg.cwd;
          const agentIdForGit = msg.id;
          const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' };
          const execGitCwd = (args, timeoutMs = 10000) => new Promise((resolve) => {
            let proc;
            let settled = false;
            if (shellMode === 'wsl') {
              const gitCwd = winPathToWsl(cwdForGit);
              proc = spawn('wsl.exe', ['git', '-C', gitCwd, ...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: gitEnv });
            } else {
              proc = spawn(GIT_BIN, args, { cwd: cwdForGit, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: gitEnv });
            }
            let out = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.on('close', (code) => { if (!settled) { settled = true; resolve(code === 0 ? out.trim() : null); } });
            proc.on('error', () => { if (!settled) { settled = true; resolve(null); } });
            setTimeout(() => { if (!settled) { settled = true; try { proc.kill(); } catch(_){} resolve(null); } }, timeoutMs);
          });
          // Fetch from remote, check behind count, then send ready signal
          execGitCwd(['rev-parse', '--is-inside-work-tree']).then(isGit => {
            if (isGit !== 'true') {
              broadcast({ type: 'set_cwd_ready', id: agentIdForGit, git: false, reason: 'not a git repository', isSelf: isSelfProject(cwdForGit) });
              return;
            }
            return execGitCwd(['branch', '--show-current']).then(branch => {
              return execGitCwd(['fetch', '--quiet'], 15000).then(fetchResult => {
                if (fetchResult === null) {
                  // Fetch failed or timed out — still send branch info
                  broadcast({ type: 'set_cwd_ready', id: agentIdForGit, git: true, branch: branch || 'unknown', behind: 0, reason: 'git fetch failed — check credentials or network', isSelf: isSelfProject(cwdForGit) });
                  return;
                }
                return execGitCwd(['rev-list', '--count', '--left-right', '@{u}...HEAD']).then(leftRight => {
                  let behind = 0;
                  if (leftRight) {
                    const parts = leftRight.split('\t');
                    behind = parseInt(parts[0]) || 0;
                  }
                  broadcast({ type: 'set_cwd_ready', id: agentIdForGit, git: true, branch: branch || 'unknown', behind, isSelf: isSelfProject(cwdForGit) });
                });
              });
            });
          }).catch(() => {
            broadcast({ type: 'set_cwd_ready', id: agentIdForGit, git: false, reason: 'git check failed', isSelf: isSelfProject(cwdForGit) });
          });
        }
        break;
      case 'stop':
        // Cancel current operation but keep agent awake with session intact
        const stopAgent = agents.get(msg.id);
        if (stopAgent && stopAgent.process) {
          debug(`[Agent ${msg.id}] Stopping current operation`);
          shellKill(stopAgent.process.pid);
          stopAgent.process = null;
          broadcast({ type: 'agent_output', id: msg.id, text: '', done: true });
          setStatus(msg.id, 'awake');
        }
        break;
      case 'sleep':
        sleepAgent(msg.id);
        break;
      case 'permission_allow': {
        // User approved denied tools — add ALL to allowed list, kill process, resume with retry
        const paAgent = agents.get(msg.id);
        const paTools = msg.tool_names || (msg.tool_name ? [msg.tool_name] : []);
        if (paAgent && paTools.length > 0) {
          if (!paAgent._allowedTools) paAgent._allowedTools = new Set();
          for (const t of paTools) paAgent._allowedTools.add(t);
          debug(`[Agent ${msg.id}] Tools approved: ${paTools.join(', ')}, allowed: [${[...paAgent._allowedTools]}]`);
          // Kill current process and retry with updated allowed-tools
          if (paAgent.process) {
            shellKill(paAgent.process.pid);
            paAgent.process = null;
          }
          const lastCmd = paAgent._lastCmd;
          if (lastCmd && paAgent.sessionId) {
            const retryText = `The following tools have been approved: ${paTools.join(', ')}. Please retry your previous action.`;
            sendCommand(msg.id, retryText, lastCmd.model, lastCmd.mode, null, null);
          }
        }
        break;
      }
      case 'permission_allow_all': {
        // User approved ALL tools — persist denied tools + common write tools to allowed list
        const paaAgent = agents.get(msg.id);
        if (paaAgent) {
          if (!paaAgent._allowedTools) paaAgent._allowedTools = new Set();
          // Add all denied tools sent from client
          const paaTools = msg.tool_names || [];
          for (const t of paaTools) paaAgent._allowedTools.add(t);
          // Also add common write tools so future commands don't hit the same wall
          for (const t of ['Bash', 'Write', 'Edit', 'NotebookEdit']) paaAgent._allowedTools.add(t);
          debug(`[Agent ${msg.id}] All tools allowed, persisted: [${[...paaAgent._allowedTools]}]`);
          if (paaAgent.process) {
            shellKill(paaAgent.process.pid);
            paaAgent.process = null;
          }
          const lastCmd = paaAgent._lastCmd;
          if (lastCmd && paaAgent.sessionId) {
            const retryText = 'All tool permissions have been granted. Please retry your previous action.';
            sendCommand(msg.id, retryText, lastCmd.model, lastCmd.mode, null, null);
          }
        }
        break;
      }
      case 'dev_server': {
        const cwd = msg.cwd;
        if (!cwd) break;
        if (msg.action === 'start') startDevServer(cwd);
        else if (msg.action === 'stop') stopDevServer(cwd, msg.port);
        else if (msg.action === 'restart') restartDevServer(cwd);
        else if (msg.action === 'status') broadcastDevServer(cwd);
        break;
      }
      case 'set_shell': {
        const requested = msg.mode; // 'cmd' or 'wsl'
        if (requested === 'wsl') {
          detectWSL().then(result => {
            if (result.available) {
              shellMode = 'wsl';
              saveConfig({ ...loadConfig(), shellMode });
              debug('[Shell] Switched to WSL');
              broadcast({ type: 'shell_mode', mode: 'wsl' });
            } else {
              broadcast({ type: 'shell_error', error: result.reason });
              broadcast({ type: 'shell_mode', mode: shellMode }); // revert UI
            }
          }).catch(err => {
            debug('[Shell] WSL detection failed:', err.message);
            broadcast({ type: 'shell_error', error: 'WSL detection failed: ' + err.message });
            broadcast({ type: 'shell_mode', mode: shellMode }); // revert UI
          });
        } else {
          shellMode = 'cmd';
          saveConfig({ ...loadConfig(), shellMode });
          debug('[Shell] Switched to CMD');
          broadcast({ type: 'shell_mode', mode: 'cmd' });
        }
        break;
      }
      default:
        debug('Unknown message type:', msg.type);
    }
  });

  ws.on('close', () => {
    debug('Client disconnected');
  });
});

// --- Dev Server Manager ---

const devServers = new Map(); // cwd -> { process, status, port, cwd }

function devServerKey(cwd) {
  return cwd.replace(/\\/g, '/').toLowerCase();
}

function isSelfProject(cwd) {
  return devServerKey(cwd) === devServerKey(__dirname);
}

function broadcastDevServer(cwd) {
  const key = devServerKey(cwd);
  const ds = devServers.get(key);
  const info = ds ? { status: ds.status, port: ds.port, cwd: ds.cwd } : { status: 'off', port: null, cwd };
  broadcast({ type: 'dev_server_status', ...info });
}

function startDevServer(cwd) {
  const key = devServerKey(cwd);
  const existing = devServers.get(key);
  if (existing && existing.status === 'on') return; // already running
  if (existing && existing.process) {
    shellKill(existing.process.pid);
  }

  const ds = { process: null, status: 'starting', port: null, cwd };
  devServers.set(key, ds);
  broadcastDevServer(cwd);

  const devCwd = shellMode === 'wsl' ? winPathToWsl(cwd).replace(/'/g, "'\\''") : cwd;
  const proc = shellMode === 'wsl'
    ? spawn('wsl.exe', ['bash', '-c', `cd '${devCwd}' && npm run dev`], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(process.execPath, [NPM_CLI_JS, 'run', 'dev'], { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  ds.process = proc;

  let outputBuf = '';
  let portFound = false;
  function parsePort(text) {
    if (portFound) return;
    // Strip ANSI escape codes before matching (dev servers often output colored text)
    const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
    // Match common patterns: localhost:PORT, 127.0.0.1:PORT, port PORT, :PORT
    const m = clean.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{3,5})/i) || clean.match(/port\s+(\d{3,5})/i);
    if (m) {
      ds.port = parseInt(m[1]);
      ds.status = 'on';
      portFound = true;
      outputBuf = '';
      broadcastDevServer(cwd);
      debug(`[DevServer] ${cwd} → port ${ds.port}`);
    }
  }

  proc.stdout.on('data', d => { if (!portFound && outputBuf.length < 10240) { outputBuf += d.toString(); parsePort(outputBuf); } });
  proc.stderr.on('data', d => { if (!portFound && outputBuf.length < 10240) { outputBuf += d.toString(); parsePort(outputBuf); } });

  proc.on('close', (code) => {
    debug(`[DevServer] ${cwd} exited (code ${code})`);
    ds.process = null;
    // On Windows, npm run dev often exits after spawning the actual server as a child.
    // If a port was detected and is still listening, keep status as 'on'.
    if (ds.port && ds.status === 'on') {
      const probe = net.connect(ds.port, '127.0.0.1');
      probe.on('connect', () => {
        probe.destroy();
        debug(`[DevServer] ${cwd} wrapper exited but port ${ds.port} still alive — keeping status on`);
      });
      probe.on('error', () => {
        ds.status = 'off';
        ds.port = null;
        devServers.set(key, ds);
        broadcastDevServer(cwd);
      });
      probe.setTimeout(2000, () => {
        probe.destroy();
        ds.status = 'off';
        ds.port = null;
        devServers.set(key, ds);
        broadcastDevServer(cwd);
      });
    } else {
      ds.status = 'off';
      ds.port = null;
      devServers.set(key, ds);
      broadcastDevServer(cwd);
    }
  });

  proc.on('error', (err) => {
    debug(`[DevServer] ${cwd} error:`, err.message);
    ds.process = null;
    ds.status = 'off';
    devServers.set(key, ds);
    broadcastDevServer(cwd);
  });

  // If no port detected in 10s, still mark as 'on' (some servers don't log port)
  setTimeout(() => {
    if (ds.status === 'starting') {
      ds.status = 'on';
      broadcastDevServer(cwd);
    }
  }, 10000);
}

function stopDevServer(cwd, clientPort) {
  const key = devServerKey(cwd);
  const ds = devServers.get(key);
  const port = (ds && ds.port) || clientPort || null;
  debug(`[DevServer] stopDevServer cwd=${cwd} port=${port} hasProcess=${!!(ds && ds.process)}`);
  if (ds && ds.process) shellKill(ds.process.pid);
  // Always kill by port — covers agent-started servers and orphaned processes
  if (port) killPort(port);
  // Verify the port is actually dead before declaring off
  if (port) {
    const probe = net.connect(port, '127.0.0.1');
    probe.on('connect', () => {
      probe.destroy();
      // Still alive — retry kill once more
      debug(`[DevServer] Port ${port} still alive after kill, retrying...`);
      killPort(port);
      // Give taskkill a moment then verify again
      setTimeout(() => {
        const probe2 = net.connect(port, '127.0.0.1');
        probe2.on('connect', () => {
          probe2.destroy();
          debug(`[DevServer] Port ${port} still alive after retry — giving up`);
          if (ds) { ds.process = null; ds.status = 'on'; ds.port = port; }
          broadcastDevServer(cwd);
        });
        probe2.on('error', () => {
          debug(`[DevServer] Port ${port} confirmed dead after retry`);
          if (ds) { ds.process = null; ds.status = 'off'; ds.port = null; }
          broadcastDevServer(cwd);
        });
        probe2.setTimeout(2000, () => { probe2.destroy(); if (ds) { ds.process = null; ds.status = 'off'; ds.port = null; } broadcastDevServer(cwd); });
      }, 500);
    });
    probe.on('error', () => {
      // Port is dead — success
      debug(`[DevServer] Port ${port} confirmed dead`);
      if (ds) { ds.process = null; ds.status = 'off'; ds.port = null; }
      broadcastDevServer(cwd);
    });
    probe.setTimeout(2000, () => {
      probe.destroy();
      // Timeout = probably dead
      if (ds) { ds.process = null; ds.status = 'off'; ds.port = null; }
      broadcastDevServer(cwd);
    });
  } else {
    if (ds) { ds.process = null; ds.status = 'off'; ds.port = null; }
    broadcastDevServer(cwd);
  }
}

function restartDevServer(cwd) {
  const key = devServerKey(cwd);
  const ds = devServers.get(key);
  if (ds && ds.process) {
    ds.status = 'restarting';
    broadcastDevServer(cwd);
    const proc = ds.process;
    proc.once('close', () => { startDevServer(cwd); });
    shellKill(proc.pid);
  } else {
    startDevServer(cwd);
  }
}

app.get('/dev-server-status', (req, res) => {
  const cwd = req.query.cwd;
  if (!cwd) return res.json({ status: 'off', port: null });
  const key = devServerKey(cwd);
  const ds = devServers.get(key);
  if (!ds) return res.json({ status: 'off', port: null, cwd });
  res.json({ status: ds.status, port: ds.port, cwd: ds.cwd });
});

// --- Start ---

const PORT = process.env.PORT || 12358;
server.listen(PORT, '127.0.0.1', () => {
  // Pre-populate auth cache so git identity is available for first agent spawn
  getGitIdentity((email, name) => {
    if (!_authCache) _authCache = {};
    if (email) _authCache.gitEmail = email;
    if (name) _authCache.gitName = name;
  });
  console.log(`\n  ⛓️  WOLF'S BASEMENT running at http://localhost:${PORT}\n`);
  const url = `http://localhost:${PORT}`;
  const { exec } = require('child_process');
  if (process.platform === 'win32') exec(`start ${url}`);
  else if (process.platform === 'darwin') exec(`open ${url}`);
  else exec(`xdg-open ${url}`);
});

// Graceful shutdown — kill all agent and dev server processes on exit
function shutdown() {
  console.log('\n  Shutting down — killing agent processes...');
  for (const [id, agent] of agents) {
    if (agent.process) shellKill(agent.process.pid, { sync: true });
  }
  for (const [key, ds] of devServers) {
    if (ds.process) shellKill(ds.process.pid, { sync: true });
    if (ds.port) killPort(ds.port);
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
