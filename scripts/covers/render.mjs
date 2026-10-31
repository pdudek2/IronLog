import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
// [kg, thickness m, radius m] per competition plate
const KG = { 25: [.054, .225], 20: [.044, .225], 15: [.035, .225], 10: [.03, .225], 5: [.028, .114], 2.5: [.021, .095], 1.25: [.016, .08], 0.625: [.012, .068] }
const stack = (list) => { let x = -.115; return list.map((k) => { const [t, R] = KG[k]; const c = x + t / 2; x += t + .0012; return [c, t, R] }) }
const scenes = {
  push: { plates: stack([25, 5, 2.5, 1.25, 0.625]), cam: [.5, .285, -.62], tgt: [.075, .205, .03], focus: .73, ap: .0075, fov: .7,
    L0: [.15, 1.35, 1.05], L0u: [1.6, 0, 0], L0v: [0, .1, .32], E0: [44, 30, 21], L1: [1.3, .75, -.85], L1u: [.5, 0, .4], L1v: [0, .5, 0], E1: [3.2, 2.1, 1.6], glowDir: [-.86, .09, 1] },
  pull: { plates: stack([25, 25, 15, 2.5]), cam: [.56, .2, -.5], tgt: [.09, .225, .06], focus: .68, ap: .0085, fov: .72,
    L0: [.15, 1.35, 1.05], L0u: [1.6, 0, 0], L0v: [0, .1, .32], E0: [44, 30, 21], L1: [1.3, .75, -.85], L1u: [.5, 0, .4], L1v: [0, .5, 0], E1: [3.2, 2.1, 1.6], glowDir: [-.98, .1, 1] },
  legs: { plates: stack([25, 25, 2.5]), cam: [.44, .38, -.74], tgt: [.05, .19, .02], focus: .86, ap: .0075, fov: .66,
    L0: [.15, 1.35, 1.05], L0u: [1.6, 0, 0], L0v: [0, .1, .32], E0: [44, 30, 21], L1: [1.3, .75, -.85], L1u: [.5, 0, .4], L1v: [0, .5, 0], E1: [3.2, 2.1, 1.6], glowDir: [-.7, .07, 1] },
  plan: { plates: stack([20, 10, 5]), cam: [.5, .25, -.66], tgt: [.07, .215, .04], focus: .78, ap: .0082, fov: .7,
    L0: [.15, 1.35, 1.05], L0u: [1.6, 0, 0], L0v: [0, .1, .32], E0: [44, 30, 21], L1: [1.3, .75, -.85], L1u: [.5, 0, .4], L1v: [0, .5, 0], E1: [3.2, 2.1, 1.6], glowDir: [-.8, .07, 1] },
}
const tones = {
  bone: { glowC: [.045, .012, .008], glowW: [.009, .0028, .002], ground: [.078, .063, .063], grade: [1.03, .985, .96], E0: [44, 30, 21], yGlow: 0 },
  steel: { glowC: [.012, .013, .016], glowW: [.0032, .0036, .0046], ground: [.063, .067, .078], grade: [.96, .985, 1.05], E0: [33, 35, 39], yGlow: 0 },
}
const name = process.argv[2] ?? 'push', tone = tones[process.argv[6] ?? 'bone'], w = +(process.argv[3] ?? 600), spp = +(process.argv[4] ?? 24), out = process.argv[5]
const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
const p = await b.newPage({ viewport: { width: 400, height: 300 } })
p.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 900)))
p.on('console', (m) => { if (m.type() === 'error') console.log('CON', m.text().slice(0, 300)) })
await p.goto('file://' + process.cwd() + '/scripts/covers/plates.html')
console.log(JSON.stringify(await p.evaluate(() => window.info())))
const S = { ...scenes[name], ...tone, glowDir: [scenes[name].glowDir[0], tone.yGlow, scenes[name].glowDir[2]], w, h: Math.round(w * .75), spp, sleeveEnd: .31, exposure: 1.0 }
const t0 = Date.now()
const url = await p.evaluate((s) => window.render(s), S)
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'))
console.log('done', Date.now() - t0, 'ms', out)
await b.close()
