import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      TZ: 'UTC', // bắt lỗi múi giờ: máy chủ UTC, quán UTC+7
      NODE_ENV: 'test',
      PASSWORD_HASH_N: '1024',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      RUN_WORKER: '0',
    },
  },
})
