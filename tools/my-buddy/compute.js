// Compute the canonical Claude Code /buddy companion for a given account UUID.
//
// The /buddy feature was removed by Anthropic around 2026-04-10. This script
// reuses the deterministic generator faithfully reverse-engineered by the
// `save-buddy` project (https://github.com/jrykn/save-buddy), so given the
// same account UUID it produces the same {species, rarity, eye, hat, shiny,
// stats} that Anthropic originally assigned.
//
// Usage:
//   bun run compute.js [accountUuid]
//
// If accountUuid is omitted, reads `oauthAccount.accountUuid` from
// ~/.claude.json.
//
// Why Bun: the native Claude Code binary ran under Bun and seeded the PRNG
// with `Bun.hash`. To get the bit-for-bit identical output, this script must
// also run under Bun. Running under Node would fall back to FNV-1a and
// produce a *different* deterministic buddy (still reproducible, but not the
// one Anthropic gave you).
//
// The species index this script reports is for the SAVE-BUDDY ordering, NOT
// the firmware's SPECIES_TABLE ordering. See the printed mapping at the end
// for the firmware idx — this is what you'd send via {"cmd":"species",
// "idx":N} over BLE, or the position to navigate to via long-press A → menu
// → next pet on the device.

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ---------- Constants from save-buddy/server/types.js ----------

const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin',
  'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
];

const EYES = ['·', '✦', '×', '◉', '@', '°'];

const HATS = [
  'none', 'crown', 'tophat', 'propeller', 'halo',
  'wizard', 'beanie', 'tinyduck',
];

const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const RARITY_WEIGHTS = {
  common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1,
};

const RARITY_FLOOR = {
  common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50,
};

// ---------- Firmware species table ordering (src/buddy.cpp) ----------
// SPECIES_TABLE in src/buddy.cpp is in a different order than save-buddy's
// SPECIES list above. Sending {"cmd":"species","idx":N} to the device must
// use this ordering. The same goes for counting "next pet" presses in the
// hardware menu starting from the default (capybara).

const FIRMWARE_SPECIES_TABLE = [
  'capybara', 'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl',
  'penguin', 'turtle', 'snail', 'ghost', 'axolotl', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
];

// ---------- Algorithm from save-buddy/server/companion.js ----------

const SALT = 'friend-2026-401';

function hashString(value) {
  // Native Claude Code ran under Bun and used Bun.hash. Match that when
  // available; otherwise fall back to FNV-1a (will produce a different but
  // still deterministic buddy).
  if (typeof globalThis.Bun !== 'undefined') {
    return Number(BigInt(globalThis.Bun.hash(value)) & 0xffffffffn);
  }
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function rollRarity(rng) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let remaining = rng() * total;
  for (const rarity of RARITIES) {
    remaining -= RARITY_WEIGHTS[rarity];
    if (remaining < 0) return rarity;
  }
  return 'common';
}

function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let secondary = pick(rng, STAT_NAMES);
  while (secondary === peak) secondary = pick(rng, STAT_NAMES);

  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === secondary) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }
  return stats;
}

function roll(userId) {
  const key = `${userId || 'anon'}${SALT}`;
  const rng = mulberry32(hashString(key));
  const rarity = rollRarity(rng);
  const bones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  };
  return { bones, inspirationSeed: Math.floor(rng() * 1e9) };
}

// ---------- Resolve account UUID ----------

function resolveAccountUuid() {
  if (process.argv[2]) return process.argv[2];
  try {
    const config = JSON.parse(
      readFileSync(join(homedir(), '.claude.json'), 'utf-8')
    );
    return config?.oauthAccount?.accountUuid ?? config?.userID ?? 'anon';
  } catch {
    return 'anon';
  }
}

// ---------- Render ----------

const accountUuid = resolveAccountUuid();
const { bones, inspirationSeed } = roll(accountUuid);
const usingBun = typeof globalThis.Bun !== 'undefined';
const firmwareIdx = FIRMWARE_SPECIES_TABLE.indexOf(bones.species);

const line = '━'.repeat(46);
console.log(line);
console.log('  Your Canonical Claude Code Buddy');
console.log(line);
console.log('  Account UUID  : ' + accountUuid);
console.log('  Hash backend  : ' + (usingBun ? 'Bun.hash (canonical ✓)'
                                             : 'FNV-1a (Node fallback — NOT canonical)'));
console.log('');
console.log('  Species       : ' + bones.species.toUpperCase());
console.log('  Rarity        : ' + bones.rarity);
console.log('  Eye           : ' + bones.eye);
console.log('  Hat           : ' + bones.hat);
console.log('  Shiny         : ' + (bones.shiny ? 'YES ✨' : 'no'));
console.log('');
console.log('  Stats:');
for (const [name, value] of Object.entries(bones.stats)) {
  const bar = '█'.repeat(Math.floor(value / 5));
  console.log('    ' + name.padEnd(12) + value.toString().padStart(3) + '  ' + bar);
}
console.log('');
console.log('  Inspiration seed: ' + inspirationSeed);
console.log(line);
console.log('  Firmware species idx: ' + firmwareIdx);
console.log('  → Send to device: {"cmd":"species","idx":' + firmwareIdx + '}');
console.log('  → Or on device:   long-press A → menu → next pet × ' + firmwareIdx);
console.log(line);
