import { defineConfig } from 'vitest/config';

// Engine tests only — no DOM environment (spec §9).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
