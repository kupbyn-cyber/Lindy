import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    // Cố định máy chủ Node: dựng bằng Bun (Dockerfile) thì Nitro tự chọn preset "bun", chạy bằng Node sẽ sập.
    nitro({ preset: 'node-server' }),
  ],
})
