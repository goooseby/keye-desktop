import { defineConfig } from 'vite'

export default defineConfig({
  build: { rollupOptions: { input: { legacy: 'index.html', workbench: 'workbench.html' } } },
})
