// Hatch a fated buddy from any seed string. Combines the deterministic
// bones roll (tools/my-buddy/lib.js) with an offline LLM hatch for the
// narrative half (name + personality + seven state lines).
//
// Usage:
//   bun run tools/hatch/hatch.js <seed>
//   bun run tools/hatch/hatch.js <seed> --json
//   bun run tools/hatch/hatch.js <seed> --write
//   bun run tools/hatch/hatch.js <seed> --bones-only
//
// Examples:
//   bun run tools/hatch/hatch.js xiaofan
//   bun run tools/hatch/hatch.js my-test-account --write
//
// LLM detection:
//   1. If `claude` is on PATH (Claude Code CLI), shells out to `claude
//      -p "<prompt>"` and parses the JSON response. This is the
//      ergonomic path for anyone using this fork.
//   2. Otherwise prints the prompt to stderr and exits 2 — paste it
//      into any LLM you have, then run with --finish-from-stdin to
//      pretty-print the result.
//
// Why Bun: same as compute.js — Bun.hash is what Anthropic's client
// used; under Node the bones are deterministic but not canonical. A
// non-canonical seed (any random string) doesn't have a "canonical"
// reading anyway, so Node is fine for experimenting.

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { roll, statHighlights, STAT_NAMES } from '../my-buddy/lib.js';

// ---------- args ----------

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const seed = positional[0];

if (!seed) {
  console.error('usage: bun run tools/hatch/hatch.js <seed> [--json|--write|--bones-only|--finish-from-stdin]');
  process.exit(1);
}

const optJson       = flags.has('--json');
const optWrite      = flags.has('--write');
const optBonesOnly  = flags.has('--bones-only');
const optFromStdin  = flags.has('--finish-from-stdin');

// ---------- bones ----------

const { bones, inspirationSeed, firmwareIdx } = roll(seed);
const { peak, floor } = statHighlights(bones.stats);

// ---------- hatch prompt ----------

const prompt = buildPrompt(seed, bones, inspirationSeed, peak, floor);

function buildPrompt(seed, bones, insp, peak, floor) {
  const statLines = STAT_NAMES.map(n => `    ${n.padEnd(10)} ${bones.stats[n]}`).join('\n');
  return `You are hatching a Claude Code /buddy companion offline. The
deterministic generator has already rolled the bones; your job is the
narrative half — name, personality, and seven short state-specific
lines, all stylistically driven by the bones.

Bones (do not change):
  Seed         : ${seed}
  Species      : ${bones.species}
  Rarity       : ${bones.rarity}
  Eye          : ${bones.eye}
  Hat          : ${bones.hat}
  Shiny        : ${bones.shiny}
  Stats:
${statLines}
  Peak stat    : ${peak}     (use this to anchor the voice)
  Floor stat   : ${floor}    (use this for blind-spots / weak moments)
  Inspiration  : ${insp}

Voice rules:
  - High WISDOM → contemplative, measured.
  - High SNARK  → dry one-liners, side-eye.
  - High CHAOS  → non-sequiturs, broken grammar, energy.
  - High PATIENCE → slow, gentle, willing to wait.
  - Low DEBUGGING → checked-out at technical detail.
  - Low PATIENCE → impatient, snappy.
  - Rarity caps tone: a "common" buddy must NOT narrate like a
    "legendary" — small life, small lines. Save grand vocabulary for
    epic/legendary buddies that earned it.
  - Stay in character across all seven states. If sleepy, sleepy in
    every line. If snarky, snarky everywhere.

Output format — respond with ONLY this JSON object, no markdown
fences, no commentary, no extra keys:

{
  "name": "<one word, ≤12 chars, evocative of bones>",
  "personality": "<one short sentence, ~12-20 words, shaped by stats>",
  "stateLines": {
    "sleep":     "<≤8 words, what they say while napping>",
    "idle":      "<≤8 words, what they say hanging out>",
    "busy":      "<≤8 words, what they say while work is happening>",
    "attention": "<≤8 words, what they say when a permission prompt arrives>",
    "celebrate": "<≤8 words, what they say on level-up / task done>",
    "dizzy":     "<≤8 words, what they say when shaken or late at night>",
    "heart":     "<≤8 words, what they say on quick approval / weekend / lunch>"
  }
}`;
}

if (optBonesOnly) {
  prettyPrint(seed, bones, inspirationSeed, firmwareIdx, peak, floor, null);
  process.exit(0);
}

// ---------- hatching ----------

let hatched;

if (optFromStdin) {
  hatched = parseHatchedJson(readSync(0));
} else {
  hatched = await tryClaudeCLI(prompt);
  if (!hatched) {
    process.stderr.write(
      '\n[hatch] `claude` CLI not found or returned no parseable JSON.\n' +
      '[hatch] Paste the following prompt into any LLM, then run:\n' +
      '[hatch]   bun run tools/hatch/hatch.js ' + JSON.stringify(seed) +
      ' --finish-from-stdin < response.json\n\n' +
      '----- PROMPT -----\n' + prompt + '\n----- END -----\n'
    );
    process.exit(2);
  }
}

// ---------- output ----------

if (optJson) {
  console.log(JSON.stringify({
    bones, firmwareIdx, inspirationSeed, ...hatched,
  }, null, 2));
} else {
  prettyPrint(seed, bones, inspirationSeed, firmwareIdx, peak, floor, hatched);
}

if (optWrite) {
  const out = {
    _note: `Hatched from seed "${seed}" via tools/hatch/hatch.js. Bones are deterministic; name/personality/stateLines were LLM-hatched offline (the original buddy_react endpoint was retired ~2026-04-10).`,
    bones, firmwareIdx, inspirationSeed,
    ...hatched,
    hatchedAt: new Date().toISOString(),
    hatchedBy: 'tools/hatch/hatch.js (claude CLI)',
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const target = join(here, '..', 'my-buddy', 'my-buddy.json');
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  process.stderr.write(`[hatch] wrote ${target}\n`);
}

// ---------- helpers ----------

async function tryClaudeCLI(prompt) {
  const which = spawnSync('which', ['claude']);
  if (which.status !== 0) return null;
  // Use --print for one-shot non-interactive mode. Pipe the prompt via
  // stdin so we don't have to escape it for the shell.
  const proc = spawnSync('claude', ['-p'], {
    input: prompt,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024,
  });
  if (proc.status !== 0) {
    process.stderr.write(`[hatch] claude exited with status ${proc.status}\n`);
    if (proc.stderr) process.stderr.write(proc.stderr);
    return null;
  }
  return parseHatchedJson(proc.stdout);
}

function parseHatchedJson(text) {
  if (!text) return null;
  // Strip code fences if the LLM ignored the no-markdown rule.
  let s = text.trim();
  s = s.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '').trim();
  // Fall back to first { ... last } if there's still chatter.
  if (s[0] !== '{') {
    const first = s.indexOf('{');
    const last  = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }
  try {
    const obj = JSON.parse(s);
    if (!obj.name || !obj.personality || !obj.stateLines) {
      process.stderr.write('[hatch] missing required fields in LLM response\n');
      return null;
    }
    return obj;
  } catch (e) {
    process.stderr.write('[hatch] JSON parse failed: ' + e.message + '\n');
    return null;
  }
}

function readSync(fd) {
  // Bun and Node both support reading stdin synchronously via the
  // 'fs' readSync on fd 0, but the chunked approach below is the
  // robust way that handles both runtimes.
  const chunks = [];
  const buf = Buffer.alloc(4096);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let n;
    try { n = require('fs').readSync(fd, buf, 0, buf.length); }
    catch { break; }
    if (!n) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function prettyPrint(seed, bones, insp, firmwareIdx, peak, floor, hatched) {
  const line = '━'.repeat(46);
  const rarityStars = { common: '★', uncommon: '★★', rare: '★★★', epic: '★★★★', legendary: '★★★★★' }[bones.rarity];

  console.log(line);
  console.log(`  Hatched buddy from seed: "${seed}"`);
  console.log(line);
  console.log(`  Species : ${bones.species.toUpperCase().padEnd(10)} (firmware idx ${firmwareIdx})`);
  console.log(`  Rarity  : ${bones.rarity} ${rarityStars}`);
  console.log(`  Eye/Hat : ${bones.eye} / ${bones.hat}`);
  console.log(`  Shiny   : ${bones.shiny ? 'YES ✨' : 'no'}`);
  console.log('');
  console.log('  Stats:');
  for (const name of STAT_NAMES) {
    const v = bones.stats[name];
    const bar = '█'.repeat(Math.floor(v / 5));
    let mark = '';
    if (name === peak)  mark = '   ← peak';
    if (name === floor) mark = '   ← floor';
    console.log(`    ${name.padEnd(10)} ${v.toString().padStart(3)}  ${bar.padEnd(20)} ${mark}`);
  }
  console.log('');
  console.log(`  Inspiration seed: ${insp}`);

  if (hatched) {
    console.log(line);
    console.log(`  Name        : ${hatched.name}`);
    console.log(`  Personality : ${hatched.personality}`);
    console.log('  Voices      :');
    for (const k of ['sleep','idle','busy','attention','celebrate','dizzy','heart']) {
      const v = hatched.stateLines?.[k] ?? '(missing)';
      console.log(`    ${k.padEnd(10)} → ${v}`);
    }
  }
  console.log(line);
}
