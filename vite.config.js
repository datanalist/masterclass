import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { generationApiPlugin } from './server/generation/vitePlugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), generationApiPlugin(env)],
  }
})
