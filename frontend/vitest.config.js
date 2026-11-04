import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      include: ['src/sim/**/*.js'],
      reporter: ['text-summary', 'text'],
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
    },
  },
});
