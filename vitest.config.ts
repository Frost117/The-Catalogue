import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

// Per the Nuxt testing guide, tests are split by environment using Vitest
// projects: pure logic runs in a plain Node project, while composable/component
// tests run in the Nuxt runtime project. Keeping them separate is important for
// test stability. See https://nuxt.com/docs/4.x/getting-started/testing.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/*.{test,spec}.ts'],
          environment: 'node',
          globals: true,
          setupFiles: ['./test/setup-globals.ts']
        }
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/*.{test,spec}.ts'],
          environment: 'nuxt',
          globals: true
        }
      })
    ]
  }
})
