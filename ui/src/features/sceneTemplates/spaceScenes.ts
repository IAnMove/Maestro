import type { SceneLayer } from '../../types'
import { asset, atmosphere, camera, effect, keyframes, type BuildContext } from './sceneBuilders'

function pair(c: BuildContext): SceneLayer[] {
  const hero = asset(c, 'hero', { x: 26, y: 58, scale: .64 })
  const other = asset(c, 'prop', { x: 73, y: 43, scale: .52 })
  other.transform.rotationY = 145
  return [hero, other]
}
function salvo(c: BuildContext): SceneLayer[] {
  return [0, .18, .36].map((offset, i) => effect(c, 'beam', `beam-${i}`, [
    { at: 0, x: 36, y: 55, opacity: 0, scale: .18, rotation: -15 },
    { at: .18 + offset, x: 36, y: 55, opacity: 0, scale: .18, rotation: -15 },
    { at: .2 + offset, x: 40, y: 53, opacity: 1, scale: .24, rotation: -15 },
    { at: .29 + offset, x: 68, y: 45, opacity: 1, scale: .2, rotation: -15 },
    { at: .31 + offset, x: 72, y: 43, opacity: 0, scale: .1, rotation: -15 },
    { at: 1, opacity: 0 },
  ]))
}
export const spaceScenes: Record<string, (ctx: BuildContext) => SceneLayer[]> = {
  'space-cruise': c => [keyframes(asset(c, 'hero', { scale: .7 }), [{ at: 0, x: 22, y: 61, scale: .5 }, { at: 1, x: 78, y: 43, scale: .85 }]), camera(c, [{ at: 0, x: 46, scale: 1.04 }, { at: 1, x: 55, scale: 1.08 }])],
  'space-orbit': c => {
    const ship = asset(c, 'hero', { scale: .42 }, 20)
    ship.animation.orbit = { targetLayerId: 'prop', radiusX: 30, radiusY: 12, turns: .65, phase: -70, facing: 'fixed' }
    return [asset(c, 'prop', { x: 57, y: 50, scale: 1.3 }, 5), ship, camera(c, [{ at: 0, x: 46, scale: 1.1 }, { at: 1, x: 54, scale: 1 }])]
  },
  'space-docking': c => [asset(c, 'prop', { x: 76, y: 45, scale: 1.2 }, 5), keyframes(asset(c, 'hero', { scale: .7 }), [{ at: 0, x: 18, y: 68, scale: .8 }, { at: .8, x: 63, y: 49, scale: .35 }, { at: 1, x: 65, y: 48, scale: .32 }]), camera(c, [{ at: 0, scale: 1 }, { at: 1, scale: 1.12, x: 54 }])],
  'space-chase': c => [keyframes(asset(c, 'hero', { scale: .7 }), [{ at: 0, x: 21, y: 65 }, { at: .5, x: 42, y: 38 }, { at: 1, x: 70, y: 49 }]), keyframes(asset(c, 'prop', { scale: .45 }), [{ at: 0, x: 46, y: 40 }, { at: .5, x: 65, y: 24 }, { at: 1, x: 87, y: 37 }]), camera(c, [{ at: 0, x: 44, rotation: -3 }, { at: 1, x: 60, rotation: 3 }], .12), atmosphere(c, 'speedlines')],
  'space-broadside': c => [...pair(c), ...salvo(c), camera(c, [{ at: 0, scale: 1 }, { at: 1, scale: 1.08 }])],
  'space-shield': c => [...pair(c), ...salvo(c), effect(c, 'shield', 'impact-shield', [{ at: 0, x: 73, y: 43, opacity: 0, scale: .7 }, { at: .28, x: 73, y: 43, opacity: 0, scale: .7 }, { at: .31, x: 73, y: 43, opacity: 1, scale: .76 }, { at: .8, x: 73, y: 43, opacity: .3, scale: .9 }, { at: 1, x: 73, y: 43, opacity: 0, scale: 1 }]), camera(c, [{ at: 0, scale: 1.04 }, { at: 1, scale: 1.1 }])],
  'space-explosion': c => {
    const ships = pair(c)
    ships[1] = keyframes(ships[1], [{ at: 0 }, { at: .5 }, { at: .53, opacity: 0 }, { at: 1, opacity: 0 }])
    return [...ships, ...salvo(c).slice(0, 1), effect(c, 'burst', 'explosion-flash', [{ at: 0, x: 73, y: 43, opacity: 0, scale: .05 }, { at: .49, x: 73, y: 43, opacity: 0, scale: .1 }, { at: .53, x: 73, y: 43, opacity: 1, scale: .5 }, { at: .68, x: 73, y: 43, opacity: .8, scale: 1.4 }, { at: 1, x: 73, y: 43, opacity: 0, scale: 2 }]), effect(c, 'debris', 'explosion-debris', [{ at: 0, x: 73, y: 43, opacity: 0, scale: .1 }, { at: .52, x: 73, y: 43, opacity: 0, scale: .1 }, { at: .56, x: 73, y: 43, opacity: 1, scale: .4 }, { at: 1, x: 73, y: 43, opacity: 0, scale: 2.3, rotation: 40 }]), camera(c, [{ at: 0, scale: 1.04 }, { at: 1, scale: 1.1 }], .18)]
  },
  'space-warp': c => [keyframes(asset(c, 'hero', { scale: .9 }), [{ at: 0, x: 44, y: 60, scale: .9 }, { at: .4, x: 46, y: 56, scale: .9 }, { at: .58, x: 65, y: 37, scale: .3 }, { at: .7, x: 80, y: 24, scale: .01, opacity: 0 }, { at: 1, opacity: 0 }]), camera(c, [{ at: 0, scale: 1 }, { at: 1, scale: 1.08 }]), atmosphere(c, 'speedlines')],
}
