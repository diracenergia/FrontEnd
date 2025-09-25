import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',  // fuerza IPv4
    port: 5173,
    strictPort: true,   // si 5173 está ocupado, falla en vez de cambiar
    open: true
  },
  preview: {
    host: '127.0.0.1',
    port: 5173
  }
});
