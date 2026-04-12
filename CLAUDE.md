# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Wolf's Basement is a visual RPG-themed terminal multiplexer that runs up to 4 Claude Code CLI sessions simultaneously. It has two modules: a pixel-art dungeon game (Basement) rendered in Phaser 3, and a multi-tab terminal interface (Terminal) — both served from a single Express + WebSocket server.

## Commands

```bash
npm start          # Start the server (default port 3000)
npm run dev        # Same as npm start
node server.js     # Direct launch
```

No build step. No bundler. No tests. The frontend is served as static files from `public/`.

## Architecture

### Three-file system

| File | Lines | Role |
|------|-------|------|
| `server.js` | ~1000 | Express server, WebSocket hub, Claude CLI process manager, git/auth/dev-server endpoints |
| `public/index.html` | ~3400 | Terminal UI, agent cards, status bar, WebSocket client, all CSS inline |
| `public/game/main.js` | ~3500 | Phaser 3 game scene — all rendering, animations, spatial awareness, agent behaviors |

### Data flow

```
Browser (index.html + game/main.js)
  ↕ WebSocket (JSON messages)
Server (server.js)
  ↕ stdin/stdout (stream-json NDJSON)
Claude CLI processes (one per agent)
```

The server spawns Claude CLI with `--output-format stream-json --input-format stream-json`. It keeps the process alive between commands using `--resume <sessionId>`. User commands go in via `proc.stdin.write()`, responses stream back via `proc.stdout` as NDJSON lines.

### Agent lifecycle

```
sleeping → summon → awake → command → working → (response) → awake → sleep → sleeping
```

- `summonAgent(id)` creates the agent state object but does NOT spawn a process
- `sendCommand(id, text, model, mode, images)` spawns the CLI process (or resumes session)
- Persona injection: `--append-system-prompt` CLI flag + CLAUDE.md written to workspace
- `ensureWorkspace(id)` always overwrites `workspaces/agent-N/CLAUDE.md` with current persona

### WebSocket message types

**Client → Server:** `summon`, `command`, `sleep`, `stop`, `clear`, `set_cwd`, `set_shell`, `permission_allow`, `permission_allow_all`, `dev_server`, `user_cmd`

**Server → Client:** `agent_status`, `agent_spawned`, `agent_output`, `agent_meta`, `agent_cwd`, `agent_error`, `agent_permission_denied`, `rate_limit`, `shell_mode`, `dev_server_status`

### Shell modes

The server supports CMD (default) and WSL. WSL mode converts all paths via `winPathToWsl()` / `wslPathToWin()` and spawns through `wsl.exe`. Claude CLI must be installed inside WSL for WSL mode to work.

### World Objects Registry

`this.worldObjects` in the game scene stores all interactive object positions (stations, pentagram, CPU/RAM text) as fractions of room dimensions. Agents can query proximity via `nearestWorldObject(agent)` and `worldObjectsNear(agent, radius)` using squared-distance checks (no sqrt).

### Agent rendering

The `drawAgent(id)` method in main.js handles all agent visuals. Each agent has unique rendering paths gated by `aid === N` checks within shared sections (feet, legs, torso, arms, head, hair, eyes, mouth). Agent 4 (The Void / cat) uses a completely separate horizontal quadruped renderer that returns early before humanoid sections.

### Persona system

`AGENT_PERSONAS` in server.js contains the full persona text per agent. It's injected via:
1. `--append-system-prompt` flag on every `sendCommand` call
2. Written to `workspaces/agent-N/CLAUDE.md` by `ensureWorkspace()` on every summon

Both mechanisms ensure the persona survives session resumption and workspace resets.

## Key patterns

- All positions are derived from `w` (room width) and `h` (room height) so they adapt to screen resize
- Agent `color` field is the body/outfit color; `labelColor` can differ (Misa: purple label, black dress; The Void: orange label, orange fur)
- Proximity reactions use a `_proxBubble` / `_proxBubbleUntil` pattern: set the text + expiry, redraw every tick, clear when expired
- Work animations are called every 80ms tick via `animateBarista`, `animateMathematician`, `animateThinker`, `animateStudent` — each gets elapsed seconds `el`
- Cleanup paths for work-end exist in 3 places: whip cancel, fake-work timeout, and status-change handler. All three must be updated when adding per-agent cleanup (see `cleanupCoffee`, `_cleanupYarn`, `_misaNotebookGfx` patterns)
- The Void (agent 4) overrides the normal work flow entirely — `_tickVoidYarn` replaces walk-to-station with yarn-chase physics
- Bubble text escalation uses `[elapsedThreshold, text]` arrays scanned in reverse
- Transient bubbles (whip/pet/respawn) use `agent._activeBubble` for tick-based repositioning — set text on show, clear on hide/fade. `hideBubble()` always clears `_activeBubble`.
- WebSocket sends use `wsSend(obj)` wrapper (not `ws.send` directly) — guards against `readyState !== OPEN`. **Never replace `ws.send` inside `wsSend` itself.**
- `renderTerminal(id)` guards `id !== selectedAgent` to prevent delayed callbacks from wiping another agent's visible terminal
- Permission prompt HTML stored in `termLines` buffer — `_updatePermInBuffer(permId, newHTML)` syncs DOM changes back to the buffer so they survive terminal rebuilds
- `selectAgent(id)` returns early if `id === selectedAgent` to prevent re-selecting the same agent (e.g., game click) from wiping the command input
- Agent card layout uses `flex-basis: 100%` on `.card-status` and `.card-project` to force consistent row structure across all cards at any width. Icon+name wrapped in `.card-identity` (inline-flex, nowrap) to prevent splitting.

### Split divider

A draggable `#split-divider` between game and terminal panels. `#game-container` uses `flex: none` with explicit width %; `#dispatch-panel` uses `flex: 1`. Ratio persisted to `localStorage('splitPct')`. Clamped 20–80%. Double-click resets to 60%. Game `handleResize()` remaps all positions proportionally on Phaser `scale.resize` event.

### Resize handling (game)

`handleResize(ow, oh, nw, nh)` in main.js remaps: walkBounds, pentagram, worldObjects, stationPositions, blood text positions, and all agent positions (current x/y, homeX/Y, sleepX/Y, walkTarget, yarn ball) using proportional scaling. Called via `this.scale.on('resize', ...)`. Scale factor `S = 1.8` is a constant, not resized.

## Agents quick reference

| # | Name | Persona | Station | Work Animation |
|---|------|---------|---------|----------------|
| 1 | Igor | Fearful hunchback servant | Coffee machine (top-left) | Barista — coffee flood spreads across room |
| 2 | Elon | Bitter ex-nobleman, occult spiral | Whiteboard (top-right) | Math → occult symbols, darkening aura |
| 3 | Misa | Amnesiac gothic yandere, calls master "Kira" | Vanity desk + Death Note (bottom-left) | Writing names in notebook |
| 4 | The Void | Orange cat, meta-aware, not enslaved | Abandoned desk (bottom-right) | Chases yarn ball across dungeon |
