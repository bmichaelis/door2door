import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), 'public/manifest.webmanifest'), 'utf8')
)

describe('manifest', () => {
  it('has the keys install criteria require', () => {
    expect(manifest.name).toBe('Door to Door')
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBe('/map')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(manifest.icons[0].src).toBe('/icon.svg')
  })
})
