import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

// node scripts/covers/render.mjs [push pull legs upper plan]
// Writes <cover>.mp4, <cover>-start.jpg and <cover>.jpg to public/covers and mobile/assets/covers.
// Needs ffmpeg and a GPU; all five take about 30 minutes.

// [kg, thickness m, radius m] per competition plate
const KG = { 25: [.054, .225], 5: [.028, .114], 2.5: [.021, .095], 1.25: [.016, .08], 0.625: [.012, .068] }
const stack = (list) => { let x = -.115; return list.map((k) => { const [t, R] = KG[k]; const c = x + t / 2; x += t + .0012; return [c, t, R] }) }
const base = {
  plates: stack([25, 5, 2.5, 1.25, 0.625]), cam: [.5, .285, -.62], tgt: [.075, .205, .03], focus: .73, ap: .0075, fov: .7,
  L0: [.15, 1.35, 1.05], L0u: [1.6, 0, 0], L0v: [0, .1, .32], E0: [44, 30, 21], L1: [1.3, .75, -.85], L1u: [.5, 0, .4], L1v: [0, .5, 0], E1: [3.2, 2.1, 1.6],
  glowDir: [-.86, 0, 1], glowC: [.045, .012, .008], glowW: [.009, .0028, .002], ground: [.078, .063, .063], grade: [1.03, .985, .96],
  sleeveEnd: .31, exposure: 1, clampL: 1.2,
}
const dim = { E0: [38, 30, 25], E1: [2.2, 1.7, 1.5], glowC: base.glowC.map((v) => v * .3), glowW: base.glowW.map((v) => v * .3) }

const clamp = (t) => Math.min(1, Math.max(0, t))
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l) }
const rodrigues = (k, t) => { const c = Math.cos(t), s = Math.sin(t), v = 1 - c, [x, y, z] = k; return [c + x * x * v, x * y * v - z * s, x * z * v + y * s, y * x * v + z * s, c + y * y * v, y * z * v - x * s, z * x * v - y * s, z * y * v + x * s, c + z * z * v] }

// A dumbbell landing on its low head: 2D impulse sim in real-time seconds
function dropSim(frames, slow, fps) {
  const out = [], g = 9.8, r = .247, ra = .092, e = .22, Iz = .036, dt = 1 / 4000
  let y = .6, vy = -.7, th = .2, w = 1.1, t = 0
  for (let f = 0; f < frames; f++) {
    const end = (f / fps) * slow
    while (t < end) {
      vy -= g * dt; y += vy * dt; th += w * dt; t += dt
      const sgn = Math.sign(th) || 1, h = y - (ra * Math.cos(th) + r * Math.sin(Math.abs(th)))
      if (h < 0) { y -= h; const rx = -sgn * r * Math.cos(th), vc = vy + w * rx; if (vc < 0) { const J = -(1 + e) * vc / (1 + rx * rx / Iz); vy += J; w += J * rx / Iz; vy *= .985; w *= .96 } }
    }
    out.push([y, th])
  }
  return out
}
// A disc settling like a coin: the tilt shrinks while the precession speeds up
function wobbleSim(frames, fps, T, a0) {
  const out = [], sub = 40; let phi = 0
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < sub; i++) { const t = (f + i / sub) / fps, a = a0 * Math.sqrt(Math.max(0, 1 - t / T)); phi += (5.2 / Math.sqrt(Math.max(Math.sin(a), .012))) * .5 / (fps * sub) * (t < T ? 1 : 0) }
    out.push([a0 * Math.sqrt(Math.max(0, 1 - f / fps / T)), phi])
  }
  return out
}

const covers = {
  // Plates slide onto the sleeve
  push: { scene: {}, frames: 168, fps: 60, pose: (f, F, S) => { F.plates = S.plates.map((x, i) => { const k = 1 - (1 - clamp((f - i * 22) / 48)) ** 3; return [x[0] + (1.45 - x[0]) * (1 - k), x[1], x[2]] }) } },
  // Slow motion: a dumbbell lands next to the other
  pull: { scene: { kind: 1, cam: [.62, .3, -.58], tgt: [.16, .03, .22], focus: .82, ap: .008, fov: .62, ...dim }, frames: 156, fps: 60, sim: () => dropSim(156, .3, 60), pose: (f, F, S, A) => {
    const [y, th] = A[f], k = clamp((f - 128) / 22), P = [-Math.sin(.62), 0, Math.cos(.62)]
    F.uC = [.02, y + (.092 - y) * k, .02]; F.uC0 = [.02, .092, .02]; F.uM = rodrigues(P, -th * (1 - k)) } },
  // Slow motion: three plates land on the pile
  legs: { scene: { kind: 3, cam: [.58, .42, -.62], tgt: [.17, -.05, .1], focus: .88, ap: .008, fov: .72, ...dim }, frames: 168, fps: 60, pose: (f, F) => {
    F.sY = [0, 1, 2, 3, 4].map((i) => { if (i < 2) return 0; const t = (f / 60) * .34 - (i - 2) * .13, h0 = .62, g = 9.8; if (t < 0) return h0; const tf = Math.sqrt(2 * h0 / g); if (t < tf) return h0 - .5 * g * t * t; const u = t - tf; return Math.max(0, g * tf * .16 * u - .5 * g * u * u) }) } },
  // Loop: the camera swings around the kettlebell, which stays put in frame
  upper: { scene: { kind: 2, cam: [.52, .3, -.66], tgt: [.2, .14, .1], focus: .84, ap: .008, fov: .62, ...dim, E0: [60, 46, 38] }, frames: 360, fps: 60, loop: true, pose: (f, F, S) => {
    const a = .5 * Math.sin(2 * Math.PI * f / 360), c = Math.cos(a), s = Math.sin(a), o = (v) => { const x = v[0] - .05; return [.05 + c * x + s * v[2], v[1], -s * x + c * v[2]] }
    F.cam = o(S.cam); F.tgt = o(S.tgt) } },
  // Slow motion: a plate wobbles flat like a coin
  plan: { scene: { kind: 4, plates: [[0, .035, .225]], cam: [.56, .42, -.7], tgt: [.2, -.03, .1], focus: .86, ap: .008, fov: .74, ...dim }, frames: 300, fps: 60, sim: () => wobbleSim(300, 60, 4.2, .62), pose: (f, F, S, A) => {
    const [a, phi] = A[f], R = .237, t = S.plates[0][1], N = [Math.sin(a) * Math.cos(phi), Math.cos(a), Math.sin(a) * Math.sin(phi)], b1 = norm(cross(N, [0, 0, 1])), b2 = cross(N, b1), psi = phi * -.04, c = Math.cos(psi), s = Math.sin(psi)
    F.uM = [...N, ...b1.map((v, i) => v * c + b2[i] * s), ...b1.map((v, i) => -v * s + b2[i] * c)]; F.uC = [.12, R * Math.sin(a) + t / 2 * Math.cos(a), .06]; F.uC0 = [0, .225, 0] } },
}

const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
const p = await b.newPage({ viewport: { width: 400, height: 300 } })
p.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 900)))
p.on('console', (m) => { if (m.type() === 'error') console.log('CON', m.text().slice(0, 300)) })
await p.goto('file://' + process.cwd() + '/scripts/covers/plates.html')
console.log(JSON.stringify(await p.evaluate(() => window.info())))

const frame = async (F, w, spp, path) => {
  const url = await p.evaluate((s) => window.render(s), { ...F, w, h: Math.round(w * .75), spp })
  writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'))
}
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
// The firefly limit in clampL costs a little brightness; the gamma gives it back
const video = 'crop=780:584:0:0,eq=gamma=1.09'
const outDirs = ['public/covers', 'mobile/assets/covers']
const dir = mkdtempSync(join(tmpdir(), 'shear-covers-'))

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(covers)) {
  const C = covers[name], S = { ...base, ...C.scene }, A = C.sim?.(), t0 = Date.now(), frames = join(dir, name)
  mkdirSync(frames)
  const posed = (f) => { const F = { ...S }; C.pose(f, F, S, A); return F }
  for (let f = 0; f < C.frames; f++) await frame(posed(f), 780, 160, join(frames, `${String(f).padStart(3, '0')}.png`))
  await frame(posed(C.loop ? 0 : C.frames - 1), 1170, 900, join(dir, 'still.png'))
  const out = (file) => join(dir, file)
  ffmpeg('-framerate', String(C.fps), '-i', join(frames, '%03d.png'), '-vf', `${video},hqdn3d=1:1:3:3`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', out(`${name}.mp4`))
  ffmpeg('-i', join(frames, '000.png'), '-vf', video, '-q:v', '3', out(`${name}-start.jpg`))
  ffmpeg('-i', out('still.png'), '-vf', 'eq=gamma=1.09', '-q:v', '3', out(`${name}.jpg`))
  for (const d of outDirs) { mkdirSync(d, { recursive: true }); for (const file of [`${name}.mp4`, `${name}-start.jpg`, `${name}.jpg`]) copyFileSync(out(file), join(d, file)) }
  console.log('done', name, Date.now() - t0)
}
rmSync(dir, { recursive: true })
await b.close()
