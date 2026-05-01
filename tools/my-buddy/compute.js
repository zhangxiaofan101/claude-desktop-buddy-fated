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

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { roll, FIRMWARE_SPECIES_TABLE, STAT_NAMES } from './lib.js';

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

const accountUuid = resolveAccountUuid();
const { bones, inspirationSeed, firmwareIdx } = roll(accountUuid);
const usingBun = typeof globalThis.Bun !== 'undefined';

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
