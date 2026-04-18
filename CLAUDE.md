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
| `server.js` | ~1100 | Express server, WebSocket hub, Claude CLI process manager, git/auth/dev-server endpoints |
| `public/index.html` | ~3500 | Terminal UI, agent cards, status bar, WebSocket client, all CSS inline |
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

**CRITICAL — argument order in `sendCommand`:** `--resume <id>` MUST be pushed BEFORE `--allowed-tools`. The CLI declares `--allowed-tools <tools...>` as variadic; if `--resume <uuid>` follows it, the parser may swallow `--resume` and the UUID as additional tool names, the resume silently fails, and the agent spawns a fresh session with no prior context. Symptom: after clicking "ALLOW ALL" on a permission prompt, the agent responds "Looking at the current state, it seems like you might have been in the middle of something..." Also pass tools as ONE comma-separated arg (`tools.join(',')`), not multiple positional args — that's the documented format and the safer pattern.

### Agent lifecycle

```
sleeping → summon → awake → command → working → (response) → awake → sleep → sleeping
```

- `summonAgent(id)` creates the agent state object but does NOT spawn a process
- `sendCommand(id, text, model, mode, images, label)` spawns the CLI process (or resumes session)
- Persona injection: `--append-system-prompt` CLI flag + CLAUDE.md written to workspace
- `ensureWorkspace(id)` always overwrites `workspaces/agent-N/CLAUDE.md` with current persona

### WebSocket message types

**Client → Server:** `summon`, `command`, `sleep`, `stop`, `clear`, `set_cwd`, `set_shell`, `permission_allow`, `permission_allow_all`, `dev_server`, `user_cmd`

**Server → Client:** `agent_status`, `agent_spawned`, `agent_output`, `agent_meta`, `agent_cwd`, `agent_error`, `agent_permission_denied`, `rate_limit`, `shell_mode`, `dev_server_status`, `set_cwd_ready`

### WebSocket origin check

The `wss.on('connection')` handler rejects any Origin that isn't `localhost`/`127.0.0.1` on the server's own `PORT` (see `isAllowedOrigin()` in server.js). Missing Origin is allowed (non-browser clients: node tests, curl). This closes the CSRF-style attack where a malicious site the user visits could open `ws://localhost:PORT` and issue agent commands. **Do not remove** — WS has no other auth layer. If you change the bind host/port or add legitimate external consumers, update the allowlist there.

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
- AWAKE status badge is green (`#50b050`), WORKING is red (`#cc3020`), SLEEPING is muted brown (`#4a3a30`)
- STOP button (`.cmd-stop-btn`) is intentionally subtle — muted red/brown, no animation. Visible only when agent is working (`updateStopButton()` toggles display).
- **Default model** is `claude-opus-4-7[1m]` (Opus 4.7, 1M context) — set in `agentState` init (index.html) and as the `selected` option in the model dropdown. When bumping the default, also add a migration branch in `loadAgentSettings()` that rewrites stale older-model values in `localStorage.agentSettings` so returning users get the new default without losing explicit non-Opus choices (e.g. Sonnet stays Sonnet). Update README's model table too.

### File attachments

Two parallel attachment arrays: `pendingImages` (base64 image data sent as `type: 'image'` content blocks) and `pendingFiles` (text file contents prepended to prompt as delimited text). Three input methods:
1. **Paperclip button** (`.cmd-attach-btn`) — below "MASTER >" in `.cmd-prompt`, opens `#file-attach-input` file picker. Accepts images + common text/code file extensions.
2. **Ctrl+V paste** — intercepts `kind === 'file'` clipboard items only (plain text paste untouched). Routes through shared `attachFile(file)`.
3. **Drag & drop** on `#command-bar` — also routes through `attachFile(file)`.

`attachFile(file)` dispatches: images → `pendingImages` (base64 via `readAsDataURL`), everything else → `pendingFiles` (text via `readAsText`, 500KB limit). On send, text file contents are prepended to the prompt as `--- filename ---\ncontent\n--- end filename ---` blocks. Images go via `msg.images` to the server's `sendCommand` which builds `type: 'image'` content blocks for Claude CLI stdin. `updateAttachmentIndicator()` shows both types with per-item remove buttons. Layout: `.cmd-prompt` is `flex-direction: column` with `.cmd-master-line` wrapper keeping "MASTER >" on one line and the paperclip below it.

### Project folder select + git check

When the user picks a project folder (`editCwd()` → `/pick-folder` → `set_cwd`), the server runs `git fetch --quiet` + behind check asynchronously. Once complete, it broadcasts `set_cwd_ready` with `{ id, git, branch, behind, reason }`. The client waits for this message (`_pendingCwdIntro`) before sending the intro command, so the agent's first response includes all three: project brief, model+mode confirmation, and git status (behind/up-to-date/not-a-repo). A bold orange terminal warning also appears if behind. On `sleepAgent()`, `agentCwd[id]` is deleted so the user must re-pick the folder on next summon.

Git subprocess safety: `execGitCwd()` uses `GIT_TERMINAL_PROMPT=0` + `SSH BatchMode=yes` to prevent credential popups from hanging the process, plus a per-call timeout (10s default, 15s for fetch). On failure, `set_cwd_ready` still fires with a `reason` field (e.g. "git fetch failed — check credentials or network") so the client always unblocks and shows the user what happened.

### Git identity

The global git identity (email + name) from `git config --global` is applied to every agent process via `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_EMAIL`, `GIT_AUTHOR_NAME`, `GIT_COMMITTER_NAME` environment variables. This ensures all agent commits across all projects are attributed to the same user — the one shown in the AUTHED panel's "Git Email" field.

- Pre-populated on server start via `getGitIdentity()`, also refreshed whenever `/auth-status` is called
- The Git Email in the AUTHED panel is editable — click to inline-edit, saves via `POST /set-git-email` → `git config --global user.email`
- Env vars override any local/project git config without modifying repo files

### Split divider

A draggable `#split-divider` between game and terminal panels. `#game-container` uses `flex: none` with explicit width %; `#dispatch-panel` uses `flex: 1`. Ratio persisted to `localStorage('splitPct')`. Clamped 20–80%. Double-click resets to 60%. Game `handleResize()` remaps all positions proportionally on Phaser `scale.resize` event.

**Perf note:** During drag, CSS width update stays instant for smooth visual feedback, but `window.game.scale.refresh()` (which triggers the full `handleResize` remap of every agent/object position) is coalesced via `requestAnimationFrame` + a `rafPending` flag. Any future code that calls `scale.refresh()` on a pointer-driven interaction should use the same rAF-throttle pattern.

### Compact mode

Toggled via `#density-toggle` button. Adds `.compact-mode` class to `#dispatch-panel`. State persisted to `localStorage('densityMode')`. All compact rules are CSS-only overrides (lines ~454–557 in index.html), no HTML changes.

**What compact mode changes:**
- **Dispatch header/title**: smaller font, muted color (`#4a3020`), no text-shadow
- **Agent cards**: collapsed to minimal tiles — icon hidden, name hidden, status badge shrunk, compact dot visible, project name inline
- **Roster grid**: no-wrap, tighter gaps
- **Status bar**: 3 rows reflowed into 2 flowing lines via `display: contents` on `.sb-row` + `flex-direction: row; flex-wrap: wrap` on `#status-bar`. All `.sb-label` text hidden. Dropdowns/buttons/stats shrunk. Project path clamped to `max-width: 220px` with `flex: 0 1 auto`.
- **Terminal header** (`#terminal-header`): hidden entirely (`display: none !important` — needs `!important` because `selectAgent()` sets inline `display: flex` via JS)
- **Command bar**: "MASTER >" label and paperclip button hidden (`.cmd-prompt` display:none), tighter padding

**Key implementation detail:** `.compact-mode` is on `#dispatch-panel`, so all compact selectors are `.compact-mode #target` or `.compact-mode .target`. Elements must be descendants of `#dispatch-panel` for this to work. The `!important` on `#terminal-header` is required because JS sets inline display.

### Response start highlight

The first `term-text` line after each `term-cmd` gets a `term-response-start` class with a faint background tint using the agent's accent color (via `--agent-resp-tint` CSS variable, 8% opacity). Tracked per-agent via `_awaitFirstResp[agentId]` flag — set `true` on `term-cmd`, cleared on first `term-text`. The `firstResp` boolean is stored in `termLines` data so it survives `renderTerminal()` rebuilds.

### Dev server manager

`devServers` Map in server.js keyed by normalized cwd (`replace(/\\/g, '/').toLowerCase()`). States: `off` → `starting` → `on`. Port detection parses stdout/stderr for `localhost:PORT` patterns. 10-second fallback marks as `on` if no port detected. On Windows, `npm run dev` often exits after spawning the actual server as a child — the `close` handler probes the detected port via TCP before declaring `off` (prevents false "OFF" status when the server is still running on an orphaned child process).

**Persona injection:** When `sendCommand` builds the `--append-system-prompt` string, it looks up `devServers.get(devServerKey(workDir))` and, if `status === 'on'`, appends a `[HARNESS NOTICE]` telling the agent a dev server is already running at `http://localhost:<port>` and not to run `npm run dev`. This prevents the agent from spawning a duplicate Vite/Next process that binds a different port (e.g. 5174 when 5173 is taken). The notice is rebuilt per-command, so stopping the harness server clears it on the next send.

### Resize handling (game)

`handleResize(ow, oh, nw, nh)` in main.js remaps: walkBounds, pentagram, worldObjects, stationPositions, blood text positions, and all agent positions (current x/y, homeX/Y, sleepX/Y, walkTarget, yarn ball) using proportional scaling. Called via `this.scale.on('resize', ...)`. Scale factor `S = 1.8` is a constant, not resized.

## Agents quick reference

| # | Name | Persona | Station | Work Animation |
|---|------|---------|---------|----------------|
| 1 | Igor | Fearful hunchback servant | Coffee machine (top-left) | Barista — coffee flood spreads across room |
| 2 | Elon | Bitter ex-nobleman, occult spiral | Whiteboard (top-right) | Math → occult symbols, darkening aura |
| 3 | Misa | Amnesiac gothic yandere, calls master "Kira" | Vanity desk + Death Note (bottom-left) | Writing names in notebook |
| 4 | The Void | Orange cat, meta-aware, not enslaved | Abandoned desk (bottom-right) | Chases yarn ball across dungeon |
