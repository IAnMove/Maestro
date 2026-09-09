import type { SceneLayer } from '../../types'
import { asset, atmosphere, camera, keyframes, layer, pulse, type BuildContext } from './sceneBuilders'

export const musicScenes: Record<string, (ctx: BuildContext) => SceneLayer[]> = {
  'music-pulse': c => [pulse(c, asset(c, 'hero', { x: 50, y: 65, scale: .92 }), 'bounce'), camera(c, [{ at: 0, scale: 1 }, { at: 1, scale: 1.08 }]), atmosphere(c, 'fireflies')],
  'music-duet': c => [pulse(c, asset(c, 'hero', { x: 32, y: 62, scale: .86 }), 'bounce'), pulse(c, asset(c, 'prop', { x: 68, y: 62, scale: .86 })), camera(c, [{ at: 0, rotation: -1.5 }, { at: 1, rotation: 1.5 }])],
  'music-chorus': c => [asset(c, 'hero', { x: 55, y: 68, scale: 1.03 }), pulse(c, layer('camera', 'camera', '', c.duration, { scale: 1.04 }, 100)), atmosphere(c, 'confetti')],
  'music-orbit': c => {
    const prop = asset(c, 'prop', { scale: .23 }, 12)
    // One model maximum per slot; only 2D props may have repeated instances.
    prop.animation.orbit = { targetLayerId: 'hero', radiusX: 29, radiusY: 18, turns: 1, phase: 0, count: prop.type === 'model3d' ? 1 : 5, facing: 'fixed' }
    return [pulse(c, asset(c, 'hero', { y: 62, scale: .8 }), 'bounce'), prop, camera(c, [{ at: 0, scale: 1.02 }, { at: 1, scale: 1.1 }]), atmosphere(c, 'sparkles')]
  },
  'music-parallax': c => [keyframes(asset(c, 'hero', { x: 34, y: 64, scale: .92 }), [{ at: 0, x: 34 }, { at: .5, x: 49, y: 61 }, { at: 1, x: 65 }]), camera(c, [{ at: 0, x: 40, scale: 1.1 }, { at: 1, x: 61, scale: 1.1 }]), atmosphere(c, 'speedlines')],
  'music-stage': c => [pulse(c, asset(c, 'hero', { x: 50, y: 66, scale: .82 }), 'bounce'), camera(c, [{ at: 0, x: 40, y: 54, scale: 1.25 }, { at: .5, x: 50, y: 48, scale: 1 }, { at: 1, x: 60, y: 54, scale: 1.2 }]), atmosphere(c, 'bokeh')],
  'music-product': c => {
    const hero = keyframes(asset(c, 'hero', { x: 62, y: 52, scale: .9 }), [{ at: 0, rotation: -5 }, { at: 1, rotation: 5 }])
    if (hero.type === 'model3d') hero.animation = { ...hero.animation, spin: true, rotationSpeed: 30 }
    return [hero, ...(c.bindings.prop ? [asset(c, 'prop', { x: 24, y: 59, scale: .3 }, 12)] : []), camera(c, [{ at: 0, x: 47, scale: 1.05 }, { at: 1, x: 52, scale: 1.2 }]), atmosphere(c, 'sparkles', '#ffc185')]
  },
  'music-finale': c => [pulse(c, asset(c, 'hero', { x: 50, y: 62, scale: .9 }), 'bounce'), camera(c, [{ at: 0, scale: 1.4, rotation: -3 }, { at: .5, scale: 1.14, rotation: 0 }, { at: 1, scale: 1 }]), atmosphere(c, 'confetti', '#ffcc87')],
}
