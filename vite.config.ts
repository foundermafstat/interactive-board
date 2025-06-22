import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // Разрешаем подключения с ngrok хостов
    allowedHosts: [
      // Явно указываем конкретные домены ngrok
      '25a0-37-15-187-82.ngrok-free.app',
      '7d9c-37-15-187-82.ngrok-free.app',
      'localhost',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});