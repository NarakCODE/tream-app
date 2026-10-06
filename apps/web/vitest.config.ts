import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
   oxc: { jsx: { runtime: 'automatic' } },
   resolve: {
      alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
   },
   test: {
      environment: 'jsdom',
      include: ['features/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
      clearMocks: true,
   },
});
