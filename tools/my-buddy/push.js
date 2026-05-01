// Emit BLE-ready JSON commands to push a hatched buddy
// (my-buddy.json) onto the device. Prints one command per line, exactly
// what to write to the Nordic UART RX characteristic
// (6e400002-b5a3-f393-e0a9-e50e24dcca9e).
//
// Usage:
//   bun run tools/my-buddy/push.js [path/to/my-buddy.json]
//   node tools/my-buddy/push.js  [path/to/my-buddy.json]
//
// Defaults to ./my-buddy.json next to this script.
//
// Why no actual BLE write here: the firmware already accepts these JSON
// frames over its existing characteristic, and host-side BLE differs
// across macOS / Linux / Windows. Pipe the output into whatever BLE tool
// you already use (LightBlue, bleak, noble, etc.). Each line is one
// frame; send them in order.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] || join(here, 'my-buddy.json');
const buddy = JSON.parse(readFileSync(path, 'utf-8'));

const cmds = [];

// 1. Species — must match firmware ordering, not save-buddy ordering.
//    `firmwareIdx` was computed by compute.js; trust it.
if (typeof buddy.firmwareIdx === 'number') {
  cmds.push({ cmd: 'species', idx: buddy.firmwareIdx });
}

// 2. Name — replaces the default "Buddy". Header on the PET screen will
//    then show just the name (per main.cpp drawPet header rule).
if (buddy.name) {
  cmds.push({ cmd: 'name', name: buddy.name });
}

// 3. State lines — one frame, all keys at once. Firmware persists each
//    to NVS and renders them in the HUD on state transitions, throttled
//    to once per 5 minutes per state.
if (buddy.stateLines && typeof buddy.stateLines === 'object') {
  cmds.push({ cmd: 'statelines', ...buddy.stateLines });
}

// Output: one JSON object per line, terminated with \n (firmware parses
// frame-by-frame on newline). No pretty-printing — keep frames compact
// to fit BLE MTU (target 517, macOS often settles at 185).
for (const c of cmds) {
  process.stdout.write(JSON.stringify(c) + '\n');
}

if (cmds.length === 0) {
  process.stderr.write(
    'No fields to push (need firmwareIdx, name, or stateLines).\n'
  );
  process.exit(1);
}

process.stderr.write(
  `\n${cmds.length} frames written to stdout. Send each line ` +
  `to the Nordic UART RX characteristic in order.\n`
);
