import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '.vercel/**'] },

  // @typescript-eslint/no-explicit-any: `any` is used throughout the codebase for
  // dynamic JSON payloads (Overpass/Overture API responses, GeoJSON parse results)
  // and mapbox-gl-draw event objects which lack exported event types.
  // Re-enable and add proper types as a follow-up (track in issue #15).
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },

  // @typescript-eslint/no-require-imports: scripts/ contains standalone Node.js
  // CommonJS scripts (.js) that predate the ESM migration; require() is expected there.
  // Re-enable once those scripts are converted to ESM (separate follow-up).
  {
    files: ['scripts/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]

export default eslintConfig
