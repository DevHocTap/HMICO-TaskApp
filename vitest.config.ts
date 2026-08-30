import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Không bật globals: mỗi file test tự `import { describe, it, expect } from 'vitest'`.
    // Dài hơn một dòng nhưng đọc là biết hàm ở đâu ra.
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    root: './',
  },
  plugins: [
    // Vitest mặc định dùng esbuild, mà esbuild KHÔNG hỗ trợ
    // emitDecoratorMetadata — thiếu nó thì dependency injection của NestJS
    // không biết kiểu tham số constructor và sẽ hỏng. SWC hỗ trợ đầy đủ.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
