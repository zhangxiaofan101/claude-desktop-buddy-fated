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

## Credit

Algorithm constants and PRNG implementation are taken from
[`save-buddy`](https://github.com/jrykn/save-buddy) by jrykn, MIT-licensed.
The species ordering for the firmware is from `src/buddy.cpp` in this repo.
