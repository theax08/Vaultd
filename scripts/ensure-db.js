import { spawnSync } from 'node:child_process';

const skipMigrations = process.env.SKIP_PRISMA_MIGRATE === 'true';
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || process.env.POSTGRES_URL || '';

if (!databaseUrl) {
  console.warn('No database URL found. Skipping prisma migrate deploy.');
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
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
});

if (result.status !== 0) {
  console.warn('prisma migrate deploy failed, but startup will continue. Check Railway Postgres connectivity and the database URL variable.');
}
