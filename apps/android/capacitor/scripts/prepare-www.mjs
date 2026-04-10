import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const repoRoot = resolve(projectRoot, '..', '..', '..');
const targetDir = resolve(projectRoot, 'www', 'shared');

mkdirSync(targetDir, { recursive: true });

const copies = [
  ['packages/shared/date-utils.js', 'date-utils.js'],
  ['packages/shared/firebase-config.js', 'firebase-config.js'],
  ['packages/shared/schedule-state.js', 'schedule-state.js'],
  ['packages/shared/schedule-repository.js', 'schedule-repository.js'],
  ['packages/schedule-core/sections.js', 'sections.js'],
  ['packages/schedule-core/tasks.js', 'tasks.js'],
];

copies.forEach(([from, to]) => {
  cpSync(resolve(repoRoot, from), resolve(targetDir, to));
});

console.log('Prepared shared modules for the Android companion app.');
