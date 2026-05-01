# hatch

One-shot CLI: take any seed string, roll bones, hatch the narrative
half via an LLM, pretty-print or write the result to
`tools/my-buddy/my-buddy.json`.

## Why this exists

The deterministic `/buddy` generator (see `tools/my-buddy/compute.js`)
only produces the bones — species, rarity, stats, eye, hat, shiny.
The original Anthropic flow then sent those bones to a `buddy_react`
LLM endpoint to author `name` and `personality`. That endpoint was
retired around 2026-04-10, so the narrative half now has to be hatched
offline.

`hatch.js` automates that step. Bones come from `lib.js` (shared with
compute.js); the narrative half comes from a local LLM call.

## Usage

```bash
# Just roll & hatch, pretty-print to stdout:
bun run tools/hatch/hatch.js <seed>

# Emit JSON suitable for piping into other tools:
bun run tools/hatch/hatch.js <seed> --json

# Replace tools/my-buddy/my-buddy.json with the hatched result
# (next `pio run -t upload` will bake it into the firmware):
bun run tools/hatch/hatch.js <seed> --write

# Skip the LLM call — bones only (matches compute.js with arbitrary seed):
bun run tools/hatch/hatch.js <seed> --bones-only
```

The seed is just a string. For a canonical recovery use your account
UUID (the same value `compute.js` reads from `~/.claude.json`); for
play, any string works.

## LLM detection

1. **`claude` CLI on PATH** — runs `claude -p` with the hatch prompt
   piped over stdin. This is the default and ergonomic path for
   anyone using this fork.
2. **Neither available** — prints the prompt to stderr with
   instructions to paste it into any LLM, then re-run with
   `--finish-from-stdin`:

   ```bash
   bun run tools/hatch/hatch.js <seed> --finish-from-stdin < response.json
   ```

   `response.json` should contain just the LLM's JSON object (the
   parser is forgiving — it strips markdown fences and salvages
   `{ ... }` from surrounding chatter).

`ANTHROPIC_API_KEY` direct-API mode is on the to-do list but not
needed when `claude` is around.

## Voice rules

The prompt encodes the same rules from
[`tools/my-buddy/README.md`](../my-buddy/README.md) — peak/floor stats
shape the voice, rarity caps the tone (a `common` buddy must not
narrate like a `legendary`). If you tweak those rules, edit
`buildPrompt()` in `hatch.js` and they propagate to every new hatch.

## Determinism

Bones are deterministic — same seed always rolls the same species,
rarity, stats, etc. Name and stateLines are **not** deterministic;
they're LLM output and will vary across runs and across models. So
don't use this tool to share buddy "lore" with someone else expecting
they'll get the same Gander — they'll get the same goose, with the
same SNARK 55 / WISDOM 1, but a different voice.
