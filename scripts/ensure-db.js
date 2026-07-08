import { spawnSync } from 'node:child_process';

const skipMigrations = process.env.SKIP_PRISMA_MIGRATE === 'true';

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Skipping prisma migrate deploy.');
  process.exit(0);
}

if (skipMigrations) {
  console.log('Skipping prisma migrate deploy because SKIP_PRISMA_MIGRATE=true.');
  process.exit(0);
}

console.log('Running prisma migrate deploy...');
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  console.warn('prisma migrate deploy failed, but startup will continue. Check Railway Postgres connectivity and DATABASE_URL.');
}
