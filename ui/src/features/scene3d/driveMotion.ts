import { wrapUnit } from './backdrop.ts'
import type { GpuWorld } from './gpu.ts'

function wrapSpan(value: number, min: number, max: number) {
  const span = max - min
  if (span <= 1e-6) return min
  return min + wrapUnit((value - min) / span) * span
}

export function clearDrive(world: GpuWorld) {
  world.driveWheels = []
  world.driveRoad = null
  world.driveMovers = []
  world.driveSpeed = 0
}

export function paintDrive(world: GpuWorld, sceneSeconds: number, speed: number) {
  const pace = Number.isFinite(speed) ? Math.abs(speed) : 0
  if (!pace || (!world.driveWheels.length && !world.driveRoad && !world.driveMovers.length)) return
  if (world.driveRoad) world.driveRoad.offset.y = wrapUnit(sceneSeconds * pace)
  const roll = sceneSeconds * pace * 88
  for (const wheel of world.driveWheels) wheel.rotation.x = roll
  for (const item of world.driveMovers) {
    const base = Number(item.userData.baseZ) || 0
    item.position.z = wrapSpan(base + sceneSeconds * pace * 32, -24, 24)
  }
}
