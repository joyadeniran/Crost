import { defineConfig } from 'vitest/config'
import path from 'path'

// Integration tests run against a REAL Postgres (TEST_DATABASE_URL must point at an
// empty scratch database — the baseline migration is applied by the test itself).
//   createdb crost_test && TEST_DATABASE_URL=postgres://localhost/crost_test npm run test:integration
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
