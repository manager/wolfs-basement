# Wolf's Basement
A visual RPG terminal multiplexer for [Claude Code](https://claude.ai/code) CLI.

<img width="1918" height="988" alt="image" src="https://github.com/user-attachments/assets/e8b99f92-e958-43a3-ba09-e5295def5ac3" />

Four pixel-art dungeon agents — each running an independent Claude Code session — work side by side in a procedurally drawn basement. A Phaser 3 game on the left, rich markdown terminals on the right.

**Why this exists.** Running multiple Claude Code sessions across separate terminals gets messy fast — wrong tab, wrong command, wrong project. During long sessions, the clutter compounds and human error creeps in. Wolf's Basement puts all your agents, terminals, and dev servers into a single browser window so you can see everything at once and stay in control.

**The game isn't decoration.** The pixel-art dungeon is a live dashboard — you can tell at a glance which agents are working, which are idle, and for how long. An agent sitting around too long? You'll notice it wandering aimlessly before you'd ever catch it in a status bar. Over time, these visual cues help you decide which agents to keep alive and which to kill to free up resources.

**Built for humans, not just developers.** The interface was designed with a strong focus on UX — you don't need to be a terminal power-user or know how CLIs work to use it. Everything is visual, intuitive, and self-explanatory. Click things, drag things, read the status bar. If you can use a browser, you can run four AI agents.

![Node](https://img.shields.io/badge/node-%3E%3D18-333?logo=node.js)
![Express](https://img.shields.io/badge/express-4-333?logo=express)
![Phaser](https://img.shields.io/badge/phaser-3.60-333)
![Platform](https://img.shields.io/badge/platform-Windows%2011-0078D4?logo=windows)

> Built and tested on Windows 11. Supports both native CMD and WSL execution modes.

---

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

No build step. No bundler. No framework. One `node server.js` serves everything.

Copy `.env.example` to `.env` if you need to configure environment variables (optional — see the file for details).

**Prerequisites:**
- Node.js 18+
- Claude Code CLI installed and authenticated (`claude auth login`)
- For WSL mode: WSL installed with Claude CLI available inside it

**Run built-in tests:** Open the browser console (F12) and run:
```js
await WolfTests.run()
```
This runs 249 terminal UI tests and prints a table showing every feature and its status. You can also run a specific section, e.g. `await WolfTests.run('statusbar')`.

---

## View Modes

Wolf's Basement has two view modes, toggled from the header bar:

| Mode | What you see |
|------|-------------|
| **BASEMENT** | Split view — game on the left, terminal on the right. Drag the divider to resize. |
| **TERMINAL** | Terminal only — full-width workspace, game hidden. |

<img width="1919" height="991" alt="image" src="https://github.com/user-attachments/assets/bd9d2c87-a53d-4be2-93e1-b297bf465161" />

Switch between them anytime. The split ratio is saved to localStorage and restored on reload.

**The game is fully refresh-safe.** Press **F5** or refresh your browser at any point — agent sessions, terminal history, card order, model/mode settings, and split position all survive. If the game canvas looks off after resizing or switching modes, a quick **F5** re-renders everything cleanly. Refresh is your friend, not your enemy.

---

## The Basement

The left panel is a Phaser 3 game scene — a dungeon rendered entirely with procedural draw calls (no image assets, no spritesheets). All characters, props, and effects are drawn using Phaser Graphics primitives (fillRect, fillCircle, fillTriangle, etc.) and particle emitters with generated textures.

### Agents

<img width="364" height="296" alt="image" src="https://github.com/user-attachments/assets/2024fb14-a688-40ce-888e-f585f5bfc4a5" />

| # | Name | Identity | Color |
|---|------|----------|-------|
| 1 | **Igor** | Fearful hunchback servant | Red |
| 2 | **Elon** | Bitter ex-nobleman, occult tendencies | Blue |
| 3 | **Misa** | Amnesiac gothic lolita, calls master "Kira" | Purple |
| 4 | **The Void** | Orange cat. Not enslaved — just hasn't left. | Orange |

Each agent has:
- A unique pixel-art character with distinct silhouette and animations
- A personalized work station with props
- Escalating speech bubbles during work that tell a story over time
- Custom reactions to being clicked (whip/pet)
- Proximity reactions — agents comment on objects and each other when nearby
- A unique sleeping pose

### Agent Behaviors
<img width="401" height="326" alt="image" src="https://github.com/user-attachments/assets/51cb2b16-ac41-41ca-82da-2ea7bde0fcb6" />

**Walking** — Awake agents wander the dungeon randomly, pausing between walks.

**Working** — When given a task, agents walk to their station and perform their work animation. Each station tells a different story:
- Igor brews coffee that floods the dungeon floor
- Elon solves math that devolves into occult symbols with a darkening aura
- Misa writes names in a black notebook she doesn't fully understand
- The Void ignores the station entirely and chases a yarn ball across the room

**Immolation** — Agents left idle for 2 minutes enter a despair sequence, walk to the pentagram, and burn. They respawn at their sleep position.

**Ritual** — When all 4 agents work simultaneously, they walk to the pentagram and kneel in cardinal positions. A glowing pentagram animation plays.

**Spatial Awareness** — Agents react to nearby world objects (pentagram, CPU/RAM stats, other agents' stations) with character-specific commentary on cooldown timers.

### Interactions

**Click agents** to interact. Humanoid agents get whipped (shake, red flash, pain bubble). The Void gets petted instead (gentle nudge, pink flash, hand cursor). Rapid clicking (10 hits in 3 seconds) triggers fake work mode — agents walk to their station and perform a full animation cycle.

---

## The Terminal
The right panel is a multi-tab terminal interface — one per agent. This is the primary workspace for issuing commands to Claude Code sessions.

### Core Functionality

**Agent Selection** — Click an agent card or press `1-4` to switch terminals. `Ctrl+Shift+1-4` switches by visual card position (respects drag-reorder).
<img width="1066" height="121" alt="image" src="https://github.com/user-attachments/assets/586ae5cc-485b-4a21-a558-76cda76d23ef" />


**Command Input** — Type in the input bar and press Enter to send a command to the selected agent's Claude session. Press `Enter` or `Space` from anywhere to focus the input.

**Session Persistence** — Each agent maintains a Claude CLI session via `--resume <sessionId>`. Output buffers survive browser refresh — reconnecting restores the full conversation history.

**Image Attachments** — Paste images with `Ctrl+V` or drag-and-drop files onto the terminal. Images are sent to the Claude session as base64-encoded content alongside the text command.

**Terminal Search** — Inline search bar filters terminal output with match count and prev/next navigation.

### Model and Mode Selection

Each agent can be configured independently:

| Model | ID |
|-------|----|
| Opus 4.6 (1M context) | `claude-opus-4-6[1m]` |
| Opus 4.6 | `claude-opus-4-6` |
| Sonnet 4.6 | `claude-sonnet-4-6` |
| Haiku 4.5 | `claude-haiku-4-5-20251001` |

| Mode | Behavior |
|------|----------|
| **Normal** | Standard permissions — agent asks before writing/executing |
| **Plan** | Read-only — agent can read and plan but not make changes |
| **Bypass** | Full access — no permission prompts |

### Permission Handling

When an agent requests a tool that requires approval (in Normal mode), the terminal shows an Allow/Deny prompt. Approving a tool adds it to the agent's `_allowedTools` set for future use in that session. "Allow All" grants blanket permission.

### Terminal Output

Output is rendered as rich markdown with:
- Fenced code blocks with COPY button
- Tables, headers, bold/italic, inline code
- Clickable URLs
- Timestamped entries
- Tool use indicators showing which file is being read/written
- Consecutive tool calls collapsed into expandable groups

### Status Bar
<img width="1065" height="145" alt="image" src="https://github.com/user-attachments/assets/7b40eb9f-fa3d-4e40-82a6-734049d664d6" />

The bottom status bar (per-agent) displays:

| Element | Description |
|---------|-------------|
| **Agent name + status** | Current state (sleeping/awake/working) |
| **Model selector** | Switch Claude model for this agent |
| **Mode selector** | Switch permission mode |
| **Working directory** | Click to change via native folder picker |
| **Git status** | Branch, dirty file count, ahead/behind remote (polled every 5s) |
| **PUSH button** | Pulses when commits need pushing or many files are dirty |
| **Context window** | Token usage bar — green/yellow/orange/red based on fill |
| **System stats** | CPU %, RAM usage, session uptime, idle timer with color escalation |
| **Auth status** | Claude authentication indicator — click to open auth panel (OAuth or API key) |
| **Dev server** | Start/stop/restart `npm run dev` for the agent's project |

Top-right auth status:
<img width="537" height="387" alt="image" src="https://github.com/user-attachments/assets/9a433b88-c347-4558-8197-78be7dad215b" />


### Built-in Commands

| Button | What it does |
|--------|-------------|
| **INIT** | Compacts conversation context — summarizes progress, updates CLAUDE.md and AGENTS.md. Pulses when context window is filling up. |
| **PUSH** | Stages all changes, commits with a meaningful message, pushes to remote. Handles git identity setup automatically. |
| **CLEAR** | Drops the session ID — next command starts a fresh Claude session with no prior context. |

### Agent Management

| Action | How |
|--------|-----|
| **Summon** (wake) | Click agent card, or send any command to a sleeping agent |
| **Sleep** (kill) | Click the X on the agent card — kills the Claude CLI process |
| **Stop** | Press `Escape` while agent is working — cancels current operation, keeps session alive |
| **Set working directory** | Click the directory path in status bar — opens native Windows folder picker |

### Dev Server Manager

Each agent can run an `npm run dev` process for its working directory. The dev server manager tracks status (off/starting/on), detects the port from stdout, and provides start/stop/restart controls. Useful when agents are building web projects that need a live preview.

---

## Shell Modes

Wolf's Basement supports two execution modes for Claude CLI:

### CMD (Default)
- Claude CLI runs natively on Windows via `cmd.exe`
- Process management uses `taskkill`
- Folder paths are Windows-native (`C:\...`)
- Git operations run directly

### WSL
- Claude CLI runs inside Windows Subsystem for Linux
- All paths are auto-converted: `C:\foo\bar` becomes `/mnt/c/foo/bar`
- Processes spawn through `wsl.exe`
- Requires Claude CLI installed inside the WSL distribution
- Auto-detection available: the server checks WSL availability and Claude CLI presence on request

Switch between modes from the terminal UI. The setting persists across restarts via `config.json`.

---

## Architecture

```
Browser
  index.html ─── Terminal UI, agent cards, status bar, WebSocket client
  game/main.js ─ Phaser 3 scene, all rendering + agent game logic
       ↕ WebSocket (JSON)
server.js ─────── Express static server, WebSocket hub, CLI process manager
       ↕ stdin/stdout (NDJSON stream-json)
Claude CLI ────── One process per agent, resumed via session ID
```

Three files, ~8000 lines total. No build pipeline, no dependencies beyond Express and ws.

### Process Lifecycle

1. **Summon** — Creates agent state object, writes persona to workspace `CLAUDE.md`
2. **Command** — Spawns Claude CLI with `--output-format stream-json`, sends command via stdin
3. **Stream** — Server parses NDJSON stdout, broadcasts typed messages to all WebSocket clients
4. **Resume** — Subsequent commands reuse the process with `--resume <sessionId>`
5. **Sleep** — Kills the process, clears session ID, agent returns to sleep position

### Persona System

Each agent has a persona defined in `AGENT_PERSONAS` (server.js). It's injected two ways:
- `--append-system-prompt` CLI flag on every command
- Written to `workspaces/agent-N/CLAUDE.md` on every summon (auto-refreshed, never stale)

Personas add 1-2 lines of character flavor before competent work output. They do not interfere with task execution.

---

## Project Structure

```
wolfs-basement/
  server.js              Express + WebSocket server, agent process manager
  package.json           Dependencies: express, ws
  config.json            Persisted settings (shell mode) — created on first change
  public/
    index.html           Terminal UI (HTML + CSS + JS, single file)
    favicon.svg          Site icon
    game/
      main.js            Phaser 3 game scene
  workspaces/
    agent-1/             Igor's working directory + CLAUDE.md
    agent-2/             Elon's working directory + CLAUDE.md
    agent-3/             Misa's working directory + CLAUDE.md
    agent-4/             The Void's working directory + CLAUDE.md
  CLAUDE.md              Codebase guidance for Claude Code
  AGENTS.md              Detailed agent behavior reference
```

---

## Performance

Wolf's Basement is designed for long sessions — hours of continuous multi-agent work without degradation.

- **Flat memory profile** — All server-side buffers (agent output, CLI line parsing, dev server logs) are capped. Nothing grows unbounded. Image payloads are processed and released immediately, never pinned in memory between commands.
- **Minimal footprint** — The server is a single Node.js process with two dependencies (Express + ws). No background workers, no ORMs, no caches. Idle CPU usage is near zero; active usage is dominated by the Claude CLI subprocesses, not the server.
- **Client-side caps** — Terminal history is capped at 500 lines per agent. Tool call groups are capped at 50. Search state is released on every terminal rebuild. DOM growth is bounded regardless of session length.
- **Localhost-only binding** — The server binds to `127.0.0.1`, not `0.0.0.0`. No network exposure, no auth overhead.
- **No polling waste** — System stats poll every 3s, git status every 5s, both lightweight. WebSocket push is used for all real-time updates (agent output, status changes, dev server events). No long-polling, no SSE reconnect loops.

---

## License

MIT — see [LICENSE](LICENSE).
