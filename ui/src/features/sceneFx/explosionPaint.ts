import { fxRandom, type SceneFx } from './types'

const tau = Math.PI * 2

function disk(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.0001, radius), 0, tau)
  ctx.fill()
}

/** Timed blast: flash, fireball lobes, shock rings, debris and delayed smoke. */
export function paintExplosion(ctx: CanvasRenderingContext2D, cue: SceneFx, _time: number, progress: number) {
  const power = cue.intensity
  const flash = Math.pow(Math.max(0, 1 - progress * 4.6), 1.7)
  const fire = Math.pow(Math.max(0, 1 - progress * 1.12), 0.72)
  const shock = Math.min(1, progress * 1.65)
  const smoke = Math.max(0, (progress - 0.14) / 0.86)

  if (flash > 0.02) {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.42)
    glow.addColorStop(0, `rgba(255,255,248,${flash})`)
    glow.addColorStop(0.18, `rgba(255,230,140,${0.9 * flash})`)
    glow.addColorStop(0.45, `rgba(255,140,40,${0.45 * flash})`)
    glow.addColorStop(1, 'rgba(255,40,0,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = glow
    disk(ctx, 0, 0, 0.42)
  }

  const coreBall = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.16 * (0.4 + fire))
  coreBall.addColorStop(0, `rgba(255,248,220,${0.95 * fire * power})`)
  coreBall.addColorStop(0.4, cue.color)
  coreBall.addColorStop(1, 'rgba(80,10,0,0)')
  ctx.globalAlpha = 0.95 * fire
  ctx.fillStyle = coreBall
  disk(ctx, 0, 0, 0.16 * (0.4 + fire))

  for (let i = 0; i < 14; i++) {
    const angle = i / 14 * tau + fxRandom(cue.seed, i) * 0.45
    const reach = fire * (0.05 + fxRandom(cue.seed, i + 20) * 0.16)
    const radius = (0.045 + fxRandom(cue.seed, i + 40) * 0.09) * (0.35 + fire)
    const x = Math.cos(angle) * reach
    const y = Math.sin(angle) * reach * 0.78 - progress * 0.04
    const lobe = ctx.createRadialGradient(x, y, 0, x, y, radius)
    lobe.addColorStop(0, `rgba(255,244,210,${0.85 * fire * power})`)
    lobe.addColorStop(0.35, cue.color)
    lobe.addColorStop(1, 'rgba(40,8,0,0)')
    ctx.globalAlpha = 0.9 * fire
    ctx.fillStyle = lobe
    disk(ctx, x, y, radius)
  }

  ctx.strokeStyle = cue.color
  for (let i = 0; i < 3; i++) {
    const phase = Math.max(0, shock - i * 0.09)
    if (phase <= 0) continue
    ctx.globalAlpha = (1 - phase) * 0.62 * power
    ctx.lineWidth = 0.016 * (1 - phase)
    ctx.beginPath()
    ctx.arc(0, 0.02, 0.06 + phase * 0.52, 0, tau)
    ctx.stroke()
  }

  ctx.lineCap = 'round'
  ctx.strokeStyle = '#ffe7a8'
  for (let i = 0; i < 52; i++) {
    const angle = fxRandom(cue.seed, i + 80) * tau
    const dist = Math.pow(progress, 0.42) * (0.12 + fxRandom(cue.seed, i + 100) * 0.58)
    const len = 0.03 + fxRandom(cue.seed, i + 120) * 0.14
    ctx.globalAlpha = Math.pow(1 - progress, 0.55) * (0.35 + fxRandom(cue.seed, i + 140) * 0.55) * power
    ctx.lineWidth = 0.004 + fxRandom(cue.seed, i + 160) * 0.007
    ctx.beginPath()
    ctx.moveTo(Math.cos(angle) * dist, Math.sin(angle) * dist)
    ctx.lineTo(Math.cos(angle) * (dist + len), Math.sin(angle) * (dist + len) + progress * 0.05)
    ctx.stroke()
  }

  for (let i = 0; i < 11; i++) {
    const angle = fxRandom(cue.seed, i + 200) * tau
    const lift = smoke * (0.06 + fxRandom(cue.seed, i + 220) * 0.22)
    const x = Math.cos(angle) * smoke * (0.04 + fxRandom(cue.seed, i + 240) * 0.16)
    const y = -lift + fxRandom(cue.seed, i + 260) * 0.04
    const radius = 0.05 + fxRandom(cue.seed, i + 280) * 0.11 + smoke * 0.08
    const puff = ctx.createRadialGradient(x, y, 0, x, y, radius)
    puff.addColorStop(0, 'rgba(90,72,62,0.55)')
    puff.addColorStop(1, 'rgba(40,32,28,0)')
    ctx.globalAlpha = 0.45 * smoke * (1 - smoke * 0.35) * power
    ctx.fillStyle = puff
    disk(ctx, x, y, radius)
  }
}
