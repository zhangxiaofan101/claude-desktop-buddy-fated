# claude-desktop-buddy-fated

**English** · [简体中文](README.zh.md)

> **Fork of [anthropics/claude-desktop-buddy](https://github.com/anthropics/claude-desktop-buddy).**
> Original hardware-buddy firmware preserved as-is; this fork adds tooling
> to recover the **canonical (account-bound, "fated") `/buddy`** that
> Anthropic's Claude Code shipped briefly in early 2026 and then removed,
> and a small workaround for getting the Hardware Buddy menu to appear
> when the feature flag fetch is blocked.

Claude for macOS and Windows can connect Claude Cowork and Claude Code to
maker devices over BLE, so developers and makers can build hardware that
displays permission prompts, recent messages, and other interactions. The
upstream project ships an ESP32 desk-pet firmware as the reference
implementation, with eighteen ASCII pets you can cycle through.

This fork's small extra: each Claude Code account once had a **canonical
buddy** — a deterministic `{species, rarity, eye, hat, stats, name,
personality}` derived from the account UUID. The `/buddy` command that
exposed it was removed from Claude Code around 2026-04-10, but the
generator was reverse-engineered by [`jrykn/save-buddy`][save-buddy], so
the assignment is recoverable. `tools/my-buddy/` reproduces it offline
and maps the species into the firmware's pet ordering, so you can pick
your fated pet on the actual stick.

> **Building your own device?** You don't need any of the code here. See
> **[REFERENCE.md](REFERENCE.md)** for the wire protocol: Nordic UART
> Service UUIDs, JSON schemas, and the folder push transport.

As an example, the upstream repo built a desk pet on ESP32 that lives off
permission approvals and interaction with Claude. It sleeps when nothing's
happening, wakes when sessions start, gets visibly impatient when an
approval prompt is waiting, and lets you approve or deny right from the
device.

<p align="center">
  <img src="docs/device.jpg" alt="M5StickC Plus running the buddy firmware" width="500">
</p>

## Hardware

The firmware targets ESP32 with the Arduino framework. As written, it
depends on the M5StickCPlus library for its display, IMU, and button
drivers—so you'll need that board, or a fork that swaps those drivers for
your own pin layout.

## Flashing

Install
[PlatformIO Core](https://docs.platformio.org/en/latest/core/installation/),
then:

```bash
pio run -t upload
```

If you're starting from a previously-flashed device, wipe it first:

```bash
pio run -t erase && pio run -t upload
```

Once running, you can also wipe everything from the device itself: **hold A
→ settings → reset → factory reset → tap twice**.

## Pairing

To pair your device with Claude, first enable developer mode (**Help →
Troubleshooting → Enable Developer Mode**). Then, open the Hardware Buddy
window in **Developer → Open Hardware Buddy…**, click **Connect**, and pick
your device from the list. macOS will prompt for Bluetooth permission on
first connect; grant it.

<p align="center">
  <img src="docs/menu.png" alt="Developer → Open Hardware Buddy… menu item" width="420">
  <img src="docs/hardware-buddy-window.png" alt="Hardware Buddy window with Connect button and folder drop target" width="420">
</p>

Once paired, the bridge auto-reconnects whenever both sides are awake.

> **"Open Hardware Buddy…" not showing up even after enabling Developer
> Mode?** That's a known issue when the GrowthBook flag fetch is blocked
> on your network. See **[`tools/enable-hardware-buddy/`](tools/enable-hardware-buddy/)**
> for a local-override workaround.

If discovery isn't finding the stick:

- Make sure it's awake (any button press)
- Check the stick's settings menu → bluetooth is on

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

The screen auto-powers-off after 30s of no interaction (kept on while an
approval prompt is up). Any button press wakes it.

## ASCII pets

Eighteen pets, each with seven animations (sleep, idle, busy, attention,
celebrate, dizzy, heart). Menu → "next pet" cycles them with a counter.
Choice persists to NVS.

## GIF pets

If you want a custom GIF character instead of an ASCII buddy, drag a
character pack folder onto the drop target in the Hardware Buddy window. The
app streams it over BLE and the stick switches to GIF mode live. **Settings
→ delete char** reverts to ASCII mode.

A character pack is a folder with `manifest.json` and 96px-wide GIFs:

```json
{
  "name": "bufo",
  "colors": {
    "body": "#6B8E23",
    "bg": "#000000",
    "text": "#FFFFFF",
    "textDim": "#808080",
    "ink": "#000000"
  },
  "states": {
    "sleep": "sleep.gif",
    "idle": ["idle_0.gif", "idle_1.gif", "idle_2.gif"],
    "busy": "busy.gif",
    "attention": "attention.gif",
    "celebrate": "celebrate.gif",
    "dizzy": "dizzy.gif",
    "heart": "heart.gif"
  }
}
```

State values can be a single filename or an array. Arrays rotate: each
loop-end advances to the next GIF, useful for an idle activity carousel so
the home screen doesn't loop one clip forever.

GIFs are 96px wide; height up to ~140px stays on a 135×240 portrait screen.
Crop tight to the character — transparent margins waste screen and shrink
the sprite. `tools/prep_character.py` handles the resize: feed it source
GIFs at any sizes and it produces a 96px-wide set where the character is the
same scale in every state.

The whole folder must fit under 1.8MB —
`gifsicle --lossy=80 -O3 --colors 64` typically cuts 40–60%.

See `characters/bufo/` for a working example.

If you're iterating on a character and would rather skip the BLE round-trip,
`tools/flash_character.py characters/bufo` stages it into `data/` and runs
`pio run -t uploadfs` directly over USB.

## The seven states

| State       | Trigger                     | Feel                        |
| ----------- | --------------------------- | --------------------------- |
| `sleep`     | bridge not connected        | eyes closed, slow breathing |
| `idle`      | connected, nothing urgent   | blinking, looking around    |
| `busy`      | sessions actively running   | sweating, working           |
| `attention` | approval pending            | alert, **LED blinks**       |
| `celebrate` | level up (every 50K tokens) | confetti, bouncing          |
| `dizzy`     | you shook the stick         | spiral eyes, wobbling       |
| `heart`     | approved in under 5s        | floating hearts             |

## Project layout

```
src/
  main.cpp       — loop, state machine, UI screens
  buddy.cpp      — ASCII species dispatch + render helpers
  buddies/       — one file per species, seven anim functions each
  ble_bridge.cpp — Nordic UART service, line-buffered TX/RX
  character.cpp  — GIF decode + render
  data.h         — wire protocol, JSON parse
  xfer.h         — folder push receiver
  stats.h        — NVS-backed stats, settings, owner, species choice
characters/      — example GIF character packs
tools/
  prep_character.py        — upstream: GIF resize/normalize helper
  flash_character.py       — upstream: USB-side character staging
  my-buddy/                — fork: recover your canonical /buddy
  enable-hardware-buddy/   — fork: local override when the menu won't appear
```

## Tools added in this fork

### [`tools/my-buddy/`](tools/my-buddy/) — recover your fated buddy

**Background.** Claude Code's `/buddy` slash command shipped in spring
2026 and was removed roughly a month later (around 2026-04-10). While it
existed, every account got a deterministic companion: feed
`accountUuid + "friend-2026-401"` through FNV-1a (or `Bun.hash` under
Bun) into a mulberry32 PRNG, then draw rarity / species / eye / hat /
shiny / stats from fixed lists in a fixed order. The same account always
produced the same buddy. Only the AI-generated `name` and `personality`
were persisted — everything else was recomputed from the seed every
render.

The community project [`jrykn/save-buddy`][save-buddy] reverse-engineered
the generator faithfully and reimplemented the surrounding plumbing as
hooks/MCP. This fork ports just the deterministic generator into a
single-file script, plus a mapping into the firmware's `SPECIES_TABLE`
order so the result is directly actionable on the M5 stick.

**Recovering yours.**

```bash
bun run tools/my-buddy/compute.js
```

Reads `oauthAccount.accountUuid` from `~/.claude.json`, prints species,
rarity, eye, hat, shiny, stats, and the firmware species index.
[Bun](https://bun.sh) is required for canonical results — under Node it
falls back to FNV-1a and you'll get a *different* deterministic buddy
than the one Anthropic actually assigned. Two ways to apply the species
on the device:

- **On the device** — long-press A → menu → "next pet" the printed
  number of times (default boot is `capybara` at idx 0). NVS-persisted.
- **Over BLE** — send `{"cmd":"species","idx":N}\n` to the Nordic UART
  RX characteristic.

**Mine, for example** ([my-buddy.json](tools/my-buddy/my-buddy.json)):

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
  "A lakeside contemplative who serves up unreasonably
   profound life advice in a perfectly flat quack — but
   watch their eyes glaze the moment a stack trace shows up."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

A philosopher duck who can't debug to save his life. Hatched offline by
Claude Opus 4.7 since the original hatching API is also gone — same
constraints as the original prompt (≤12-char one-word name, one-sentence
personality scaled by rarity).

### [`tools/enable-hardware-buddy/`](tools/enable-hardware-buddy/) — Hardware Buddy menu workaround

The "Open Hardware Buddy…" menu item in Claude Desktop is gated by a
GrowthBook feature flag that the app fetches at startup. If the fetch
fails — most commonly because a Cloudflare challenge is interposed on
your network path (some VPN/proxy users hit this), or the flag simply
isn't enabled for your account yet — the menu item never appears, even
with Developer Mode on. It's a server-fetch issue, not a license check.

`enable.py` writes the flag into Claude's local feature cache
(`~/Library/Application Support/Claude/fcache`) so the menu item shows up
without touching the proxy or anything else in Claude. Fully quit Claude
first, run the script, reopen — the menu appears. See
[`tools/enable-hardware-buddy/README.md`](tools/enable-hardware-buddy/README.md)
for the full caveats; it's an unofficial workaround, not endorsed by
Anthropic.

## Roadmap / WIP

Things I'm poking at, lightly maintained, no schedule:

- **Auto-set species over BLE on connect.** Today the stick boots into
  capybara and you cycle to your fated species manually. The bridge
  could read `tools/my-buddy/my-buddy.json` and send the species command
  on connect.
- **Render the personality on-device.** The `attention`/`celebrate`
  states currently use generic strings; substituting your buddy's
  `personality` into the speech bubble would make the stick feel more
  like *yours*.
- **Offline hatching helper.** A small script that takes bones +
  inspiration seed and asks a local Claude to generate
  `{name, personality}` in the original prompt format, for accounts that
  never got hatched before the API was shut down. (My own buddy was
  hatched this way — see Pondsage above.)
- **Sync from upstream periodically.** `git fetch upstream && git merge
  upstream/main` whenever anthropics ships changes worth pulling.

PRs welcome but not actively solicited; this is a personal-scale fork.

## Availability

The BLE API is only available when the desktop apps are in developer mode
(**Help → Troubleshooting → Enable Developer Mode**). It's intended for
makers and developers and isn't an officially supported product feature.

## Credits

- **[anthropics/claude-desktop-buddy](https://github.com/anthropics/claude-desktop-buddy)**
  — the upstream project. Firmware, BLE protocol, all eighteen ASCII
  pets, the GIF character system, and the Hardware Buddy window are all
  theirs. This fork preserves their work as-is and only adds the two
  tools above.
- **[jrykn/save-buddy][save-buddy]** (MIT) — the deterministic `/buddy`
  generator (PRNG, hash, constants, ordering) used by
  `tools/my-buddy/compute.js` is a single-file port of save-buddy's
  algorithm. The accompanying `METHODOLOGY.md` in that repo is the
  authoritative forensic reference for the original feature.

[save-buddy]: https://github.com/jrykn/save-buddy
