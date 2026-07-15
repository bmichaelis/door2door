import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // .claude/worktrees holds sibling git worktrees for other in-flight issues;
  // they live under the repo dir but are separate checkouts — never lint them
  // (they pollute results with another branch's code). CI checkouts don't have
  // them, so this only affects local runs.
  { ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '.vercel/**', '.claude/**'] },

  // @typescript-eslint/no-require-imports: scripts/ contains standalone Node.js
  // CommonJS scripts (.js) that predate the ESM migration; require() is expected there.
  // Re-enable once those scripts are converted to ESM (separate follow-up).
  {
    files: ['scripts/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]

export default eslintConfig
