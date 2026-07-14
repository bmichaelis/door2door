import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // .claude/worktrees are sibling checkouts of other in-flight branches; their
    // test files must not run here (they fail against this branch's env/state).
    // CI checkouts don't contain them; this keeps local `test:run` honest.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
