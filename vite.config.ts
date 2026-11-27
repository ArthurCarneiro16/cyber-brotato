import { defineConfig } from 'vitest/config';

// publicDir padrão (./public): os assets saem em /assets/... exatamente como o jogo e o preview pedem.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
