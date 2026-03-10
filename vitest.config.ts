import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest 4 uses projects instead of workspace
    include: ['**/*.test.ts'],
    projects: [
      {
        name: 'server',
        root: './packages/server',
        test: {
          include: ['src/**/*.test.ts'],
        },
      },
      {
        name: 'web',
        root: './packages/web',
        test: {
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
})
