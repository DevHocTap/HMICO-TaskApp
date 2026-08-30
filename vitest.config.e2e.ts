import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    root: './',
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
