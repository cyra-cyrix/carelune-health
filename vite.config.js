import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { siteAssets } from './scripts/siteAssets.mjs'

// The APPLICATION build (app.carelune.in). Entry is index.html → src/main.tsx
// (auth + all role workspaces + PWA). Output is dist/app, kept separate from the
// marketing build (vite.marketing.config.ts → dist/marketing).
export default defineConfig({
  plugins: [react(), siteAssets({ target: 'app' })],
  server: { host: true },
  build: {
    outDir: 'dist/app',
    rollupOptions: {
      output: {
        // Split rarely-changing vendor libs into their own long-cache chunk so a
        // code change doesn't invalidate React/Supabase for returning users.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
