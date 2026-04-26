// Creates dist/lib/index.cjs after tsc runs.
// The CJS shim is needed because Turbopack/webpack require a real CJS file
// for the require() export condition. Node.js 22+ supports require() of
// synchronous ESM, so the shim just re-exports the ESM entry.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const target = 'dist/lib/index.cjs';
const content = `'use strict';
// CJS shim — Turbopack/webpack need a real CJS file for the require() export condition.
// Node.js 22+ supports require() of synchronous ESM, so this loads the ESM entry.
const mod = module.require('./index.js');
module.exports = mod;
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, content);
console.log(`Created ${target}`);
