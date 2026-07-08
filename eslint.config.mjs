import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '.vercel/**'] },

  // any is currently pervasive in external-API GeoJSON payloads (Overture/
  // Overpass) and mapbox-gl-draw events (no exported TS types) in these files.
  // Typed cleanup + removal tracked in issue #31.
  {
    files: [
      'app/(app)/admin/businesses/client.tsx',
      'app/(app)/admin/neighborhoods/page.tsx',
      'app/(app)/admin/parcels/client.tsx',
      'components/map/DrawControl.tsx',
      'components/map/DrawMap.tsx',
    ],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  // @typescript-eslint/no-require-imports: scripts/ contains standalone Node.js
  // CommonJS scripts (.js) that predate the ESM migration; require() is expected there.
  // Re-enable once those scripts are converted to ESM (separate follow-up).
  {
    files: ['scripts/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]

export default eslintConfig
