# AGENTS.md

Configuration and behavior reference for the four dungeon agents in Wolf's Basement.

## Agent Roster

### Agent 1 — Igor (Red)
- **Color**: #cc4040 / RGB(204,64,64)
- **Personality**: Fearful hunchback servant. Stammers, grovels, refers to self in third person. "y-yes Master", "Igor does it right away!", "please don't hurt Igor"
- **Station**: Top-left (15%, 30%)
- **Work Animation**: Barista — coffee machine with steam, single growing puddle (3 concentric layers: outer medium-brown, mid darker, core darkest), drip streams, particles. Puddle grows over ~80s.
- **Bubble Behavior**: Escalating coffee madness ("brewing..." → "THE BEANS SPEAK" → "god is coffee" → "(incoherent gurgling)")
- **Whip Cry**: Pain/fear exclamations in English
- **Unique**: Only agent with coffee flood system. Flood cleaned up with fade-out tween on work end.

### Agent 2 — Elon (Blue)
- **Color**: #6090cc / RGB(96,144,204)
- **Personality**: Bitter ex-nobleman. Dry sarcasm crushed under servitude, condescending remarks followed by panicked apologies. "as you command, Master", "brilliant order, truly... I mean, yes Master"
- **Station**: Top-right (85%, 30%)
- **Work Animation**: Mathematician — equations on whiteboard text ("2+1=3", "pi=3.2!", "0/0=inf"), text grows + reddens with panic over time, tilts after 40s
- **Bubble Behavior**: Escalating mathematical despair ("calculating..." → "the numbers mock me" → "I USED TO HAVE SERFS" → "(sobbing in calculus)")
- **Bubble Position**: Offset FAR LEFT when at station (bx = ax - tw - 40) so whiteboard remains visible. Tail anchored at right edge of bubble.
- **Whip Cry**: Indignant/bitter exclamations

### Agent 3 — Misa (Gothic Pink/Black)
- **Color**: #dd2255 / RGB(221,34,85) — card color; in-game body is 0x1a1a1a (black gothic lolita)
- **Personality**: Bubbly gothic-lolita girl with fragmented amnesia. Flashes of a notebook, a beautiful boy, cameras — but can't piece it together. Obsessively devoted to "Kira" (what she calls her master — the name feels right but she can't remember why). Flirty, theatrical, yandere. "anything for you, Kira~♡", "Misa-Misa will do it~!", "does Kira love Misa now?"
- **Visual**: Highly detailed — blonde pigtails with red ribbon bows, big anime eyes with red irises and heavy eyeliner, corset dress with red lacing, flared skirt with petticoat, cross necklace, choker with pendant, thigh-high stockings with lace trim, platform boots with buckles and gold studs, gothic bracelets, beauty mark, blush marks, pouty red lips. Most visually detailed agent.
- **Station**: Bottom-left (15%, 65%) — vanity desk with Death Note notebook, small mirror, red pen
- **Work Animation**: Writing in the Death Note — open notebook with lines appearing in red ink, pen bobs as she writes, heart doodles on margins after 40s. No sweat/redness.
- **Bubble Behavior (working)**: Notebook writing escalation ("ooh, nice notebook~♡" → "I'll write them down~" → "L... no. Light...?" → "why is the pen red" → "Misa's hand won't stop~")
- **Proximity: Notebook amnesia** — when near her station while NOT working, fragmented Death Note memories surface ("that notebook... feels familiar...", "names... Misa should write names..."). 66s cooldown, cycles through 6 lines.
- **Proximity: Jealousy** — when near another awake agent, possessive reactions. 75s cooldown, never same target twice in a row.
- **Bubble Position**: Offset FAR RIGHT when at station (bx = ax + 40) so sweat/redness animation remains visible. Tail anchored at left edge of bubble.
- **Whip Cry**: Default cries (shared pool)

### Agent 4 — The Void (Orange)
- **Color**: #e88830 / RGB(232,136,48)
- **Personality**: An orange cat. Not enslaved — just hasn't left yet. Detached, meta-aware, laconic. Observes the basement with feline amusement. "doing human things...", "could leave. won't though.", "....". Speaks ~50% less than other agents — often just "....".
- **Visual**: Orange cat body — round chonky torso with white belly patch, pointy ears with pink inner ears, green slit-pupil eyes, pink nose triangle, whiskers, swaying tail with dark tip, round paws with pink toe beans, tabby forehead stripes. Non-humanoid silhouette.
- **Station**: Bottom-right (85%, 65%)
- **Work Animation**: Yarn ball — red ball that sways/bounces, trailing yarn string
- **Bubble Behavior**: Sparse meta observations ("doing human things..." → "...." → "could leave." → "...." → "won't though." → "....")
- **Bubble Position**: Centered (default)
- **Whip Cry**: Unimpressed cat reactions ("rude.", "noted.", "i allow this.", "....")

## Shared Behaviors

### Status Lifecycle
```
sleeping → summon → awake → command → working → (response done) → awake → sleep → sleeping
```

### Walking
- Base speed: 1.568 + random(0.784), multiplied by random 1.15-1.33x
- Walk target: random point in walkBounds, pause 1.5-3s between walks
- Walk frame increments for animation

### Immolation (Idle > 2 minutes)
1. **Despair** (6s): Escalating bubbles, body shaking
2. **Walk**: Moves to pentagram center at speed 2.5
3. **Burn** (7s): Fire/smoke/charring particles, body fades
4. **Ash** (3s): Ash pile fades, respawn at sleep position
- Satanic pentagram overlay appears on despair start, fades when last immolating agent finishes
- Blocked if agent gets a task (cancelImmolation)

### 10-Lash Easter Egg
- Tracks all clicks (even during shake animation via `whipRapidHits[id]` timestamp array)
- 10 hits in 3 seconds on awake agent → `_fakeWorking = true`, shows "I OBEY" bubble, 1s grace period before cancel-able
- Agent walks to station, performs normal work animation with BLUE status dot
- Auto-stops after 140 seconds (one full animation cycle)
- Any lash hit after grace period cancels fake work → back to wandering
- Blocked during immolation (`agent.immolation` check)

### Death Burn (Sleep)
- `_deathBurn` flag set, status kept as previous during animation
- Agent frozen (tickAgent returns immediately), walkTarget nulled, bubble hidden
- Fire particles + body fade at current position
- After burn: teleport to sleep position, draw sleeping pose

### Ritual (All 4 Working)
- All 4 agents must have `status === 'working'`
- Agents walk to pentagram positions (4 cardinal points around center)
- Kneel facing center
- Glowing pentagram lines + star animation on ritualGfx layer (depth 45)

## Persona Injection

Agent personas are defined in `AGENT_PERSONAS` object in server.js. On first command to a working directory, a `CLAUDE.md` file is written with the persona text. This makes the Claude CLI session adopt the personality.

Persona format: 1-2 lines of flavor at response start, then competent work. The persona should NOT interfere with actual task execution.

## Visual Reference

### Status Dot Colors (game)
- Sleeping: #444455
- Awake: #44cc44
- Working: #eebb33
- Fake working (whip-triggered): #3388ff (blue)

### Status Badge Colors (terminal UI cards)
- Sleeping: #4a3a30
- Awake: #50b050 (green)
- Working: #cc3020 (red, with workPulse animation)
- Permission pending: #cc8020 (orange, with permPulse animation)

### Station Positions (fraction of room W/H)
- Igor: (0.15, 0.30) — top-left
- Elon: (0.85, 0.30) — top-right
- Misa: (0.15, 0.65) — bottom-left
- The Void: (0.85, 0.65) — bottom-right

### Sleep Positions
- Igor: (cx-50, cy-12) — on bed mat, curled fetal position with hump visible
- Elon: (cx+50, cy-12) — on bed mat, dignified on-back pose, arms crossed
- Misa: (cx-50, cy+14) — on bed mat, on side with pigtails splayed, ribbon bows
- The Void: (w*0.12, h*0.90) — alone in far corner, cat loaf with tail wrapped around, no bed mat
