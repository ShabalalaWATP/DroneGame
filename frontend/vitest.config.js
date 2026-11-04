import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    environment: 'node',
    coverage: {
      // src/render and the canvas it draws on need WebGL, so they are checked with a browser smoke test instead
      include: ['src/sim/**/*.js', 'src/ui/**/*.{js,jsx}'],
      reporter: ['text-summary', 'text'],
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
    },
  },
});
