import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: resolve(process.cwd(), 'public/assets/characters/edgerunner'),
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
