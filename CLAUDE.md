# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Wolf's Basement — a visual RPG terminal multiplexer for Claude Code CLI. Four pixel-art dungeon agents each run independent Claude CLI sessions. Phaser 3 game (60% left) + HTML terminal panel (40% right).

## Running

```
npm run dev
# Open http://localhost:3000
```

No build step. No tests. Single `node server.js` serves everything.

## Architecture

### Three Layers

1. **Server** (`server.js`, ~520 lines) — Express + WebSocket + agent process manager. Spawns `claude -p --verbose --output-format stream-json --input-format stream-json` per agent. Parses NDJSON stdout, broadcasts to clients. REST endpoints: `/system-stats` (CPU/RAM), `/pick-folder` (Windows native dialog), `/git-status` (branch/dirty/ahead/behind).

2. **Client** (`public/index.html`, ~2300 lines) — Single HTML file with all CSS + JS inline. WebSocket client, full markdown terminal renderer, fire/burn/starburst animations, image paste (Ctrl+V), drag-drop attachments, in-terminal search, context window monitoring, git status display. State stored in `agentState[1-4]`.

3. **Game** (`public/game/main.js`, ~2440 lines) — Phaser 3 scene. All art is procedural (no asset files except favicon.svg). Per-agent unique pixel-art characters, work animations, immolation system, ritual system, whip interaction, coffee flood, satanic pentagram overlay, blood CPU/RAM text.

### Message Flow

Client sends WebSocket JSON → Server handles in switch (`summon`, `command`, `clear`, `set_cwd`, `stop`, `sleep`, `user_cmd`) → Server spawns claude CLI with stream-json input/output → Parses NDJSON lines from stdout → Broadcasts `agent_output`, `agent_status`, `agent_cwd`, `agent_meta`, `agent_history` back to client.

### Agent Process Model

- Prompt sent via stdin as JSON: `{type:'user', message:{role:'user', content:[{type:'text',...}, {type:'image',...}]}}`
- Session continuity via `--resume {sessionId}` — sessionId captured from stream output
- Mode flags: `--dangerously-skip-permissions` (bypass), `--permission-mode plan` (plan), nothing (normal)
- Changing mode preserves session. Changing model or CWD clears session.
- Each agent has a persona CLAUDE.md in `workspaces/agent-{id}/` that injects personality.

### Session Persistence

- Server stores `outputBuffer` per agent as `{text, cls, ts}` objects (text + CSS class + timestamp)
- User commands are stored via `msg.label` field in the `command` message, pushed to buffer inside `sendCommand()` after auto-summon
- System messages (awakened, CWD set) stored via `user_cmd` WebSocket message type
- On WebSocket reconnect (page refresh), server sends `agent_history` with full buffer — includes user commands, system messages, agent responses, all with timestamps
- `agentState` exposed as `window.agentState` for Phaser game sync
- Agent card order persisted in `localStorage` as `agentCardOrder`
- Server tracks `awakeAt` timestamp per agent, sent with `agent_status` on reconnect

### Terminal Features

- **Markdown rendering**: headings (H1-H3), bold, italic, inline code (click-to-copy), code blocks (COPY button), blockquotes, bullet/numbered/nested lists, tables, horizontal rules, paragraph spacing
- **Timestamps**: every message stamped with `Apr 10, 3:26PM` format, stored server-side, survives refresh
- **MASTER > tag**: user commands prefixed with orange MASTER label + timestamp
- **Agent name tag**: responses prefixed with colored agent name + timestamp, per-agent left border color
- **Copy response**: hover COPY button on each agent response, copies HTML + plain text (strips agent name and timestamp)
- **Search**: per-agent search bar in terminal header, highlights matches, ▲/▼ navigation, match counter, Escape to clear
- **Fire indicator**: ASCII flame animation (░▒▓█) while agent works, with elapsed timer
- **CLEAR burn animation**: 1.5s fire sweeps up terminal text bottom-to-top
- **Sleep burn animation**: same fire animation triggered when sending agent to sleep (if terminal visible)
- **INIT starburst**: golden rays + overlay animation on INIT
- **Image attachments**: Ctrl+V paste or drag-drop, supports PNG/JPG/WEBP/GIF, indicator bar with remove buttons

### Status Bar (3 rows)

- **Row 1**: Model (Opus 4.6 1M / Opus 4.6 / Sonnet 4.6 / Haiku 4.5), Mode (Normal/Plan/Bypass), Context window progress bar + % + token count, INIT button (smart pulsation), CLEAR button
- **Row 2**: CPU %, RAM % (with GB), Uptime, Idle timer (color escalation: green→yellow→orange→red)
- **Row 3**: Project Folder (click to browse via native Windows dialog), Git status (⎇ branch + dirty/pushed/behind)

### Context Window Monitor

- Progress bar with 4 color tiers: green (<30%), yellow (<60%), orange (<80%), red (80%+)
- Hover tooltip shows exact `X / Y tokens used (Z%)`
- Auto-detects 200k vs 1M based on model selection (`[1m]` in model ID)
- INIT button pulsation: soft pulse at 15+ messages, bright pulse at 30+ messages or 70%+ context
- Dynamic tooltips per threshold level

### Git Integration

- Server endpoint `/git-status?cwd=...` runs git commands in parallel (branch, status --porcelain, rev-list, log -1)
- Client polls every 5s, also refreshes on agent switch / CWD change
- Shows: branch name (green=clean, orange=dirty), status ("N unsaved", "N not pushed", "N behind", "all saved")
- Hover tooltip with last commit message + detailed breakdown

### Keyboard Shortcuts

- `Ctrl+Shift+1-4`: switch agent by visual position (respects drag-reorder, works from anywhere including inputs)
- `1-4`: switch agent (when not in input field, respects visual position)
- `Escape`: stop working agent / clear search / deselect agent (context-dependent)
- `Enter`: send command
- `Shift+Enter`: newline in command input
- `Ctrl+V`: paste image attachment

### Agents

| ID | Name | Color | Personality | Work Animation |
|----|------|-------|-------------|----------------|
| 1 | Igor | Red (#cc4040) | Fearful hunchback, third-person speech | Barista — coffee machine + single growing/darkening puddle |
| 2 | Elon | Blue (#6090cc) | Bitter ex-nobleman, dry sarcasm | Mathematician — equations + panic (bubble offset left) |
| 3 | Vladimir | Green (#60cc60) | Stoic monk, zen calm, hooded | Thinker — sweating + redness (bubble offset right) |
| 4 | رشيد (Rashid) | Gold (#ccaa40) | Hyperactive, Arabic bubble text | Student — books + vibrating |

### Key Game Systems

- **Immolation**: Agent idle 2+ min → despair bubbles → walks to pentagram → satanic pentagram overlay appears + pulsates → 7-second burn → ash pile → respawn at bed → overlay fades
- **Death Burn**: Sleeping an agent freezes them in place, hides bubble, triggers 3-second instant inferno
- **Ritual**: All 4 agents working simultaneously → walk to pentagram → kneel → glowing pentagram animation
- **Coffee Flood** (Igor only): Single puddle with 3 concentric layers (outer/mid/core), grows over ~80s, each layer darkens independently, drip streams + particles
- **Whip**: Custom flogger cursor, per-agent cry text (Arabic for Rashid), shake + particles on hit
- **10-Lash Easter Egg**: 10 clicks in 3 seconds on an agent (tracked even during shake animation) → "I OBEY" bubble → agent walks to station and performs work animation with BLUE status dot → stops after one full cycle (140s) → any lash cancels fake work (after 1s grace period) → blocked during immolation
- **Satanic Pentagram Overlay**: Inverted star + Baphomet goat head (horns, triangular face, eyes) + Hebrew rune marks, appears/pulsates during immolation, fades when immolation ends (checks all agents)
- **Blood CPU/RAM**: Floor text near pentagram, 3 independent tiers each (30%/50%/80%), color darkens + alpha increases + pulse speeds up per tier
- **Agent walk speed**: base 1.568-2.352, multiplied by random 1.15-1.33x per agent

### Depth Ordering (Phaser)

Floor/decorations: 0-9, Coffee flood: 3, Blood stats: 5, Satanic overlay: 8, Agents: 10+y, Bubbles: 20-21, Ritual: 45, Lighting/vignette: 50-60

### Important Patterns

- All Phaser textures are generated programmatically in `generateTextures()` — no external image assets
- Agent drawing (`drawAgent`) has per-ID branches for unique silhouettes (hunchback, hood, vest, etc.)
- Bubble positioning: Elon's bubble offsets far-left at station, Vladimir's far-right, tail anchored at bubble edge
- WebSocket max payload: 50MB (for image attachments)
- Server buffers last 500 output entries per agent as `{text, cls, ts}`, sent on client reconnect
- Delta streaming: fragments accumulate in `agent.currentDelta`, flushed to buffer on `result` event or process exit
- `agentCwd[id]` overrides default `workspaces/agent-{id}` directory
- Windows-specific: uses `taskkill /t /f` for process termination, PowerShell for folder picker
- Agent card drag-drop order saved to localStorage, keyboard shortcuts respect visual position
- `_fakeWorking` flag distinguishes whip-triggered work (blue dot, auto-stops after cycle) from real CLI work
- `_deathBurn` flag freezes agent tick during sleep burn animation
