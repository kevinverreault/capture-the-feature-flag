import { defineConfig } from 'prisma/config';

// Used by the Prisma CLI only (generate, and `migrate dev` / `migrate diff` when authoring migrations).
// At runtime Core applies the migrations in prisma/migrations itself (see src/database/migrate.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
