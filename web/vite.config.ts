import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Báo lỗi thay vì lặng lẽ nhảy sang 5174 khi cổng bị chiếm. Nhảy cổng
    // âm thầm khiến CORS chặn mà rất khó đoán ra nguyên nhân.
    strictPort: true,
  },
});
