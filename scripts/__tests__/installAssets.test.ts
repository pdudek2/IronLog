import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectFile = (path: string) => resolve(process.cwd(), path)

function pngDimensions(path: string): [number, number] {
  const png = readFileSync(projectFile(path))
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

describe('installable web app assets', () => {
  it('links the manifest and Apple metadata from the document', () => {
    const html = readFileSync(projectFile('index.html'), 'utf8')

    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"')
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"')
  })

  it('keeps the accepted identity, launch route and correctly sized icons', () => {
    const manifest = JSON.parse(
      readFileSync(projectFile('public/manifest.webmanifest'), 'utf8'),
    ) as {
      name: string
      short_name: string
      id: string
      start_url: string
      scope: string
      display: string
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>
    }

    expect(manifest).toMatchObject({
      name: 'IronLog',
      short_name: 'IronLog',
      id: '/',
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
    })
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
    expect(pngDimensions('public/icon-192.png')).toEqual([192, 192])
    expect(pngDimensions('public/icon-512.png')).toEqual([512, 512])
    expect(pngDimensions('public/icon-maskable-512.png')).toEqual([512, 512])
    expect(pngDimensions('public/apple-touch-icon.png')).toEqual([180, 180])
  })
})
