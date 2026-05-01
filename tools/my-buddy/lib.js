// Shared algorithm for the deterministic /buddy generator. Both
// compute.js (single-account recovery) and hatch.js (any-seed
// experiment) import from here so the rolling logic stays single-
// source. Constants and PRNG come from save-buddy
// (https://github.com/jrykn/save-buddy), MIT-licensed.

export const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin',
  'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
];

export const EYES = ['·', '✦', '×', '◉', '@', '°'];

export const HATS = [
  'none', 'crown', 'tophat', 'propeller', 'halo',
  'wizard', 'beanie', 'tinyduck',
];

export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];
export const RARITIES   = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_WEIGHTS = {
  common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1,
};

export const RARITY_FLOOR = {
  common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50,
};

// SPECIES_TABLE in src/buddy.cpp uses a different ordering than save-
// buddy's SPECIES list above. Use this one when sending
// {"cmd":"species","idx":N} to the device.
export const FIRMWARE_SPECIES_TABLE = [
  'capybara', 'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl',
  'penguin', 'turtle', 'snail', 'ghost', 'axolotl', 'cactus', 'robot',
  'rabbit', 'mushroom', 'chonk',
];

export const SALT = 'friend-2026-401';

export function hashString(value) {
  // Anthropic's Claude Code ran under Bun and used Bun.hash. Match that
  // when available; otherwise fall back to FNV-1a (deterministic but
  // produces a *different* buddy than the canonical one).
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

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function rollRarity(rng) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let remaining = rng() * total;
  for (const rarity of RARITIES) {
    remaining -= RARITY_WEIGHTS[rarity];
    if (remaining < 0) return rarity;
  }
  return 'common';
}

export function rollStats(rng, rarity) {
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

// Pure roll — same input always gives same output. The seed is treated
// as an opaque string; for canonical results pass an accountUuid, but
// any string is a valid experiment.
export function roll(seed) {
  const key = `${seed || 'anon'}${SALT}`;
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
  const inspirationSeed = Math.floor(rng() * 1e9);
  const firmwareIdx = FIRMWARE_SPECIES_TABLE.indexOf(bones.species);
  return { bones, inspirationSeed, firmwareIdx };
}

// Helper to produce the peak/floor stat names — useful for prompts and
// pretty-printing alike.
export function statHighlights(stats) {
  let peak = STAT_NAMES[0], floor = STAT_NAMES[0];
  for (const k of STAT_NAMES) {
    if (stats[k] > stats[peak])  peak  = k;
    if (stats[k] < stats[floor]) floor = k;
  }
  return { peak, floor };
}
