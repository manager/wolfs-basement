# Wolf's Basement

A visual RPG terminal multiplexer for [Claude Code](https://claude.ai/code) CLI.

Four pixel-art dungeon agents — each running an independent Claude CLI session — work side by side in a procedurally drawn basement. Phaser 3 game on the left, rich markdown terminals on the right.

![Node](https://img.shields.io/badge/node-%3E%3D18-333?logo=node.js)
![Express](https://img.shields.io/badge/express-4-333?logo=express)
![Phaser](https://img.shields.io/badge/phaser-3.60-333)

## Quick Start

```bash
npm install
npm run dev
# → http://localhost:6666
```

No build step. No framework. One `node server.js` serves everything.

## Agents

| # | Name | Personality |
|---|------|-------------|
| 1 | **Igor** | Fearful hunchback, third-person speech |
| 2 | **Elon** | Bitter ex-nobleman, dry sarcasm |
| 3 | **Vladimir** | Stoic hooded monk, zen calm |
| 4 | **رشيد (Rashid)** | Hyperactive, Arabic bubble text |

Each agent has its own persona, pixel-art character, work animation, and color-coded terminal.

## Architecture

**Server** — Express + WebSocket + agent process manager. Spawns `claude` CLI per agent with stream-json I/O, parses NDJSON, broadcasts to clients.

**Client** — Single HTML file. Full markdown terminal with timestamps, search, image paste, fire animations, context window monitoring, and git status display.

**Game** — Phaser 3 scene. All art is procedural (no asset files). Unique per-agent characters, immolation system, ritual system, whip interaction, coffee flood, and a satanic pentagram overlay.

## Features

- **4 independent Claude sessions** with model/mode switching (Opus/Sonnet/Haiku, Normal/Plan/Bypass)
- **Rich terminal** — markdown rendering, code blocks with copy, clickable URLs, inline search
- **Session persistence** — output buffers survive page refresh via WebSocket reconnect
- **Context window monitor** — live token usage bar with color-coded thresholds
- **Git integration** — branch, dirty/pushed/behind status, polled every 5s
- **System stats** — CPU, RAM, uptime, idle timer with color escalation
- **Drag-reorder** agent cards, keyboard shortcuts (`Ctrl+Shift+1-4`, `Escape`)
- **Image attachments** via `Ctrl+V` paste or drag-drop

## License

Private.
