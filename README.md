# claude-desktop-buddy-fated

**English** · [简体中文](README.zh.md)

> **Fork of [anthropics/claude-desktop-buddy](https://github.com/anthropics/claude-desktop-buddy).**
> Original hardware-buddy firmware preserved as-is; this fork adds tooling
> to recover the **canonical (account-bound, "fated") `/buddy`** that
> Anthropic's Claude Code shipped briefly in early 2026 and then removed,
> bakes that buddy's name and seven personality lines into the firmware,
> and includes a small workaround for getting the Hardware Buddy menu to
> appear when the feature flag fetch is blocked.

What you get when you flash this fork: a wrist-sized device that boots
straight into **your** Claude Code companion — its species, name, and
seven state-specific lines, all derived from your account UUID by the
deterministic generator that Anthropic's now-removed `/buddy` command
used.

<p align="center">
  <img src="docs/device.jpg" alt="M5StickC Plus running the buddy firmware" width="500">
</p>

> **Building your own device from scratch?** You don't need any of the
> code here. See **[REFERENCE.md](REFERENCE.md)** for the BLE wire
> protocol: Nordic UART Service UUIDs, JSON schemas, the folder push
> transport.

---

## Quickstart

Five steps end-to-end. Numbered so you don't have to read the rest of
the README to get going. Each step links into the section below it for
the deep version.

```
 1. RECOVER  ─→  2. HATCH  ─→  3. FLASH  ─→  4. PAIR  ─→  5. (optional) PUSH
   bones        name+lines       firmware        BLE          tweak live
```

### 1. Recover your bones

The deterministic half of your buddy — species, rarity, eye, hat,
shiny, five stats. One command:

```bash
bun run tools/my-buddy/compute.js
```

[Bun](https://bun.sh) is required for canonical results (Anthropic's
client also ran under Bun and used `Bun.hash` to seed the PRNG). Reads
`oauthAccount.accountUuid` from `~/.claude.json` by default, or pass a
UUID as the first arg.

The script prints a card and the firmware species index. Save the
species/rarity/stats — step 2 needs them.

### 2. Hatch the narrative half

The deterministic generator only produces *bones*. The original flow
also returned a `name` and a one-sentence `personality`, both authored
by an Anthropic-hosted LLM at hatch time over the `buddy_react`
endpoint. **That endpoint was retired around 2026-04-10**, so the
narrative half now has to be hatched offline by whatever LLM is on
hand.

In this fork, that means filling in `tools/my-buddy/my-buddy.json` by
hand (or by asking any LLM to follow
[`tools/my-buddy/README.md`](tools/my-buddy/README.md)'s
*Offline-hatch protocol*):

```jsonc
{
  "bones":          { /* from step 1 */ },
  "firmwareIdx":    1,                         // from step 1
  "inspirationSeed": 441251612,                // from step 1
  "name":           "Pondsage",                // hatched by an LLM
  "personality":    "Lakeside sage. Speaks in flat quacks. Profound until a stack trace appears.",
  "stateLines": {                              // one short line per firmware state
    "sleep":     "the pond dreams too.",
    "idle":      "still water. still me.",
    "busy":      "the current does the work.",
    "attention": "someone's calling me.",
    "celebrate": "a quiet quack of yes.",
    "dizzy":     "even lakes catch chill.",
    "heart":     "two ripples, one pond."
  }
}
```

Voice rules — how stats and rarity should shape the lines a buddy can
say (e.g. high WISDOM + low DEBUGGING produces contemplative-but-
checked-out energy; `common` rarity should not narrate like a
`legendary`) — live in
[`tools/my-buddy/README.md`](tools/my-buddy/README.md) under
*Offline-hatch protocol*. Keep each `stateLine` short — they flash on a
135×240 portrait screen, not a paragraph.

A WIP `tools/hatch/` is on the roadmap to do this step automatically by
calling `claude -p` on the bones. Until then it's a copy-paste round
trip with whatever LLM you prefer.

### 3. Flash the firmware

Install [PlatformIO Core](https://docs.platformio.org/en/latest/core/installation/),
then:

```bash
pio run -t upload
```

A pre-build hook (`tools/my-buddy/gen_defaults.py`) reads
`tools/my-buddy/my-buddy.json` and generates `src/my_buddy_defaults.h`,
which the firmware uses as compile-time defaults. **First boot after a
fresh flash already produces your canonical buddy** — name, species,
and all seven voices baked in. No further action needed.

If you're starting from a previously-flashed device with stale NVS data
(e.g. someone else's pushed name), wipe it first:

```bash
pio run -t erase && pio run -t upload
```

You can also factory-reset from the device itself: **hold A → settings
→ reset → factory reset → tap twice**.

### 4. Pair with Claude Desktop

Open the Hardware Buddy window: **Developer → Open Hardware Buddy…**
(needs Developer Mode: **Help → Troubleshooting → Enable Developer
Mode**). Click **Connect**, pick your device, accept the macOS
Bluetooth permission on first connect.

<p align="center">
  <img src="docs/menu.png" alt="Developer → Open Hardware Buddy… menu item" width="420">
  <img src="docs/hardware-buddy-window.png" alt="Hardware Buddy window with Connect button and folder drop target" width="420">
</p>

Once paired, the bridge auto-reconnects whenever both sides are awake.

> **"Open Hardware Buddy…" doesn't show up?** Known issue when the
> GrowthBook feature flag fetch is blocked on your network. See
> **[`tools/enable-hardware-buddy/`](tools/enable-hardware-buddy/)**
> for a local-override workaround.

### 5. (optional) Push live edits

Steps 1–3 already produce the canonical buddy — most users stop there.
But if you want to **tweak the name or any state line without
reflashing**, push them at runtime:

```bash
bun run tools/my-buddy/push.js
```

Emits three BLE-ready JSON frames to stdout (`species`, `name`,
`statelines`) from your `my-buddy.json`. Send each line to the Nordic
UART RX characteristic via your favorite BLE writer (LightBlue, bleak,
noble, …). Or, if the device is plugged in over USB, write them
straight to the serial port — the firmware parses JSON from both
bridges. NVS overrides compile-time defaults, so a push wins until the
next factory reset.

---

## Why "fated"

Claude Code's `/buddy` slash command shipped in spring 2026 and was
removed roughly a month later (around 2026-04-10). While it existed,
every account got a deterministic companion: feed
`accountUuid + "friend-2026-401"` through FNV-1a (or `Bun.hash` under
Bun) into a mulberry32 PRNG, then draw rarity / species / eye / hat /
shiny / stats from fixed lists in a fixed order. The same account
always produced the same buddy. Only the AI-generated `name` and
`personality` were persisted — everything else was recomputed from the
seed every render.

The community project [`jrykn/save-buddy`][save-buddy] reverse-
engineered the generator faithfully. This fork ports just the
deterministic generator into a single-file script, plus a mapping into
the firmware's `SPECIES_TABLE` order, plus a build step that bakes the
hatched buddy into the firmware. The pet on your wrist isn't a generic
Buddy — it's *yours*, fated by your account UUID.

**My example.** Pondsage, the contemplative duck Pondsage who rolls
his eyes at stack traces:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Species       : DUCK 🦆          (firmware idx 1)
  Rarity        : common ★
  Eye           : ◉
  Hat           : none
  Shiny         : no
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEBUGGING     6   █                ← weakness
  PATIENCE     18   ███
  CHAOS        15   ███
  WISDOM       68   █████████████    ← peak
  SNARK        44   ████████
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Name: Pondsage
  "Lakeside sage. Speaks in flat quacks.
   Profound until a stack trace appears."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Hatched offline by `claude-opus-4-7` since the hatching API is also
gone — same constraints as the original prompt (≤12-char one-word
name, one-sentence personality scaled by rarity).

---

## The seven states

Inherited from upstream, unchanged. Each species has hand-authored
ASCII frames for every state.

| State       | Trigger                     | Feel                        |
| ----------- | --------------------------- | --------------------------- |
| `sleep`     | bridge not connected        | eyes closed, slow breathing |
| `idle`      | connected, nothing urgent   | blinking, looking around    |
| `busy`      | sessions actively running   | sweating, working           |
| `attention` | approval pending            | alert, **LED blinks**       |
| `celebrate` | level up (every 50K tokens) | confetti, bouncing          |
| `dizzy`     | you shook the stick         | spiral eyes, wobbling       |
| `heart`     | approved in under 5s        | floating hearts             |

## The seven voices (this fork)

Each fated buddy gets its own short line for every one of those seven
states. Lines are baked into the firmware at compile time (from
`my-buddy.json`) and additionally writable to NVS at runtime. They
flash in a band between the pet and the HUD/approval card for ~4.5 s
on every state change — surviving both transcript flow and approval
prompts so the pet still gets to chime in while Claude is working.
Per-state cooldown of 5 minutes keeps idle↔sleep flapping from making
the pet a chatterbox.

Pondsage speaks like this:

| state       | what Pondsage says            |
| ----------- | ----------------------------- |
| `sleep`     | the pond dreams too.          |
| `idle`      | still water. still me.        |
| `busy`      | the current does the work.    |
| `attention` | someone's calling me.         |
| `celebrate` | a quiet quack of yes.         |
| `dizzy`     | even lakes catch chill.       |
| `heart`     | two ripples, one pond.        |

A `legendary` epic with `WISDOM 92 / CHAOS 88` would presumably say
something a lot more deranged on `dizzy`.

The on-device side also drops the "Owner's Buddy" header once a real
name has been compiled in or pushed: Pondsage stands as **Pondsage**,
not as "Xiaofan's Pondsage". Owner is still visible on the INFO
screen, so attribution isn't lost.

---

## Hardware

The firmware targets ESP32 with the Arduino framework. As written, it
depends on the M5StickCPlus library for its display, IMU, and button
drivers — so you'll need that board, or a fork that swaps those
drivers for your own pin layout.

## Controls

|                         | Normal               | Pet         | Info        | Approval    |
| ----------------------- | -------------------- | ----------- | ----------- | ----------- |
| **A** (front)           | next screen          | next screen | next screen | **approve** |
| **B** (right)           | scroll transcript    | next page   | next page   | **deny**    |
| **Hold A**              | menu                 | menu        | menu        | menu        |
| **Power** (left, short) | toggle screen off    |             |             |             |
| **Power** (left, ~6s)   | hard power off       |             |             |             |
| **Shake**               | dizzy                |             |             | —           |
| **Face-down**           | nap (energy refills) |             |             |             |

Screen auto-powers-off after 30 s of no interaction (kept on while an
approval prompt is up). Any button press wakes it.

## ASCII pets

Eighteen pets, each with seven animations. Menu → "next pet" cycles
them with a counter. Choice persists to NVS. The compile-time default
species (from `my-buddy.json`) only kicks in on a fresh / wiped NVS.

## GIF pets

If you want a custom GIF character instead of an ASCII buddy, drag a
character pack folder onto the drop target in the Hardware Buddy
window. The app streams it over BLE and the stick switches to GIF mode
live. **Settings → delete char** reverts to ASCII mode.

A character pack is a folder with `manifest.json` and 96px-wide GIFs:

```json
{
  "name": "bufo",
  "colors": {
    "body": "#6B8E23", "bg": "#000000",
    "text": "#FFFFFF", "textDim": "#808080", "ink": "#000000"
  },
  "states": {
    "sleep": "sleep.gif",
    "idle": ["idle_0.gif", "idle_1.gif", "idle_2.gif"],
    "busy": "busy.gif", "attention": "attention.gif",
    "celebrate": "celebrate.gif", "dizzy": "dizzy.gif", "heart": "heart.gif"
  }
}
```

State values can be a single filename or an array (arrays rotate at
each loop end). GIFs are 96 px wide, height up to ~140 px stays on the
135×240 portrait screen. The whole folder must fit under 1.8 MB —
`gifsicle --lossy=80 -O3 --colors 64` typically cuts 40–60%.

`tools/prep_character.py` handles resizing source GIFs;
`tools/flash_character.py characters/bufo` skips the BLE round-trip and
stages a pack into `data/` for `pio run -t uploadfs`. See
`characters/bufo/` for a working example.

---

## Project layout

```
src/
  main.cpp              — loop, state machine, UI screens, speech band
  buddy.cpp             — ASCII species dispatch + render helpers
  buddies/              — one file per species, seven anim functions each
  ble_bridge.cpp        — Nordic UART service, line-buffered TX/RX
  character.cpp         — GIF decode + render
  data.h                — wire protocol, JSON parse
  xfer.h                — folder push receiver, name/owner/species/statelines cmds
  stats.h               — NVS-backed stats, settings, name, species, state lines
  my_buddy_defaults.h   — generated pre-build, compile-time fallback values
characters/             — example GIF character packs
tools/
  prep_character.py        — upstream: GIF resize/normalize helper
  flash_character.py       — upstream: USB-side character staging
  my-buddy/                — fork: recover & hatch your fated buddy
    compute.js             — bones from accountUuid (deterministic)
    my-buddy.json          — your hatched buddy (sources of truth)
    push.js                — emit BLE/USB frames to apply at runtime
    gen_defaults.py        — pre-build codegen → src/my_buddy_defaults.h
  enable-hardware-buddy/   — fork: local override when the menu won't appear
```

---

## Tools added in this fork

### [`tools/my-buddy/`](tools/my-buddy/)

Recover, hatch, bake-in, and push a fated buddy. Files documented
above; the [tool-level README](tools/my-buddy/README.md) details the
voice rules and the offline-hatch protocol that keeps name/personality/
state lines stylistically aligned with the bones.

### [`tools/enable-hardware-buddy/`](tools/enable-hardware-buddy/)

The "Open Hardware Buddy…" menu item is gated by a GrowthBook feature
flag fetched at app start. If the fetch fails — most commonly because
a Cloudflare challenge is interposed on your network path (some
VPN/proxy users hit this), or the flag isn't enabled for your account
yet — the menu item never appears, even with Developer Mode on. It's a
server-fetch issue, not a license check.

`enable.py` writes the flag into Claude's local feature cache
(`~/Library/Application Support/Claude/fcache`) so the menu item shows
up without touching the network. Fully quit Claude → run the script →
reopen → menu appears. See the
[tool README](tools/enable-hardware-buddy/README.md) for full
caveats; it's an unofficial workaround, not endorsed by Anthropic.

---

## Roadmap / WIP

Things I'm poking at, lightly maintained, no schedule:

- **`tools/hatch/`** — one-shot CLI that takes a seed (your UUID, or
  any string), rolls bones, and shells out to `claude -p` (or
  `ANTHROPIC_API_KEY`) to hatch name + personality + state lines in
  one go, writing straight to `my-buddy.json`. Removes the manual
  copy-paste in step 2.
- **Auto-set species over BLE on connect.** Today the desktop bridge
  doesn't push anything that the firmware now bakes in; this would be
  a fallback for users who don't want to recompile.
- **Sync from upstream periodically.** `git fetch upstream && git
  merge upstream/main` whenever Anthropic ships changes worth pulling.

PRs welcome but not actively solicited; this is a personal-scale fork.

## Availability

The BLE API is only available when the Claude Desktop apps are in
developer mode (**Help → Troubleshooting → Enable Developer Mode**).
It's intended for makers and developers and isn't an officially
supported product feature.

## Credits

- **[anthropics/claude-desktop-buddy](https://github.com/anthropics/claude-desktop-buddy)**
  — the upstream project. Firmware, BLE protocol, all eighteen ASCII
  pets, the GIF character system, and the Hardware Buddy window are
  all theirs. This fork preserves their work as-is and adds the
  fated-buddy tooling, the on-device speech band, and the GrowthBook
  fcache override.
- **[jrykn/save-buddy][save-buddy]** (MIT) — the deterministic
  `/buddy` generator (PRNG, hash, constants, ordering) used by
  `tools/my-buddy/compute.js` is a single-file port of save-buddy's
  algorithm. The accompanying `METHODOLOGY.md` in that repo is the
  authoritative forensic reference for the original feature.

[save-buddy]: https://github.com/jrykn/save-buddy
