import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const buildDir = join(process.cwd(), 'build');
mkdirSync(buildDir, { recursive: true });

writeFileSync(
  join(buildDir, '.build-manifest.json'),
  JSON.stringify({ status: 'ok', builtAt: new Date().toISOString() }, null, 2),
);

console.log('Build complete');
