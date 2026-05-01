# my-buddy

Compute your canonical Claude Code `/buddy` companion from your account UUID,
and look up its index in this firmware's species table so you can pick it on
the hardware.

## Background

The Claude Code `/buddy` feature was a deterministic ASCII companion: given
the same account, you always got the same species + rarity + eye + hat +
shiny + stats. Anthropic removed the feature around 2026-04-10. The
[`save-buddy`](https://github.com/jrykn/save-buddy) project reverse-engineered
the generator faithfully; this tool is a single-file port of that algorithm
plus a mapping to the species ordering in `src/buddy.cpp`.

## Usage

Requires [Bun](https://bun.sh) for canonical results (the original ran under
Bun and used `Bun.hash`).

```bash
bun run tools/my-buddy/compute.js
```

Reads `oauthAccount.accountUuid` from `~/.claude.json` by default, or pass a
UUID as the first arg.

## Setting your buddy on the device

The output prints the firmware species index. Two ways to apply it:

1. **On the device** — long-press A → menu → "next pet" the printed number
   of times. The default boot species is `capybara` (idx 0). Choice persists
   to NVS.
2. **Over BLE** — send `{"cmd":"species","idx":N}\n` to the Nordic UART
   Service RX characteristic. The device persists it the same way.

## Note on hash backend

If Bun is not installed, the script falls back to FNV-1a (matches
save-buddy's Node fallback). That still produces a deterministic buddy for
your UUID, but it will be a *different* buddy than the one Anthropic
originally assigned. Install Bun if you want the canonical answer:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Offline-hatch protocol (name, personality, state lines)

`compute.js` only produces the deterministic half of a buddy: `bones`
(species / rarity / eye / hat / shiny / stats) and `inspirationSeed`. In the
original Anthropic flow, the client uploaded those bones to a `buddy_react`
endpoint and the server-side LLM hatched the `name` + `personality` text on
demand. That endpoint was retired around 2026-04-10, so the narrative half
now has to be hatched offline by whatever LLM is on hand.

For consistency, anyone (or any model) hatching a buddy into this repo
should fill **all** of the following fields in `my-buddy.json`:

| field | source | notes |
|---|---|---|
| `bones`, `inspirationSeed`, `firmwareIdx` | `compute.js` | deterministic from accountUuid |
| `name` | offline hatch | one word, ≤12 chars, evocative of bones |
| `personality` | offline hatch | one short sentence (~12–20 words), shaped by peak/floor stats |
| `stateLines` | offline hatch | one short line per state in the buddy's voice |
| `hatchedAt`, `hatchedBy` | offline hatch | ISO date + which model did the hatching |

`stateLines` covers the seven firmware states. Keep each line short (≤8
words) — they're meant to flash on a 240×135 screen, not to be read like
prose. Keys must match the firmware's state vocabulary exactly (see
`stateNames[]` in `src/main.cpp`):

```json
"stateLines": {
  "sleep":     "...",  // P_SLEEP     — napping, low activity
  "idle":      "...",  // P_IDLE      — connected, hanging out
  "busy":      "...",  // P_BUSY      — multiple sessions running
  "attention": "...",  // P_ATTENTION — permission prompt waiting
  "celebrate": "...",  // P_CELEBRATE — task just completed / level up
  "dizzy":     "...",  // P_DIZZY    — shaken, late night
  "heart":     "..."   // P_HEART    — affection / weekend / lunch
}
```

Voice should be driven by stats, not by genre clichés:

- High **WISDOM** + low **DEBUGGING** → contemplative but checked-out at
  technical detail (Pondsage's flavor).
- High **CHAOS** → non-sequiturs, broken grammar, energy.
- High **SNARK** → dry one-liners, side-eye.
- High **PATIENCE** → measured, slow, gentle.
- Low floor across the board (`common`) → small life, small lines; resist
  the urge to write epic legendary energy into a common buddy.

Rarity also caps tone: a `common` buddy should not narrate like a
`legendary` one. Save the grand vocabulary for buddies that earned it.

## Credit

Algorithm constants and PRNG implementation are taken from
[`save-buddy`](https://github.com/jrykn/save-buddy) by jrykn, MIT-licensed.
The species ordering for the firmware is from `src/buddy.cpp` in this repo.
