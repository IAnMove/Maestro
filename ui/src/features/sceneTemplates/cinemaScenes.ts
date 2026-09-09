import type { SceneLayer } from '../../types'
import { asset, atmosphere, camera, keyframes, type BuildContext } from './sceneBuilders'

/** These are shot grammars, not a second renderer: every result is editable
 * using the existing scene timeline, camera and normal asset layers. */
export const cinemaScenes: Record<string, (ctx: BuildContext) => SceneLayer[]> = {
  'cinema-establishing': c => [asset(c, 'hero', { x: 68, y: 70, scale: .48 }), camera(c, [{ at: 0, x: 46, scale: 1.1 }, { at: 1, x: 54, scale: 1 }]), atmosphere(c, 'dust')],
  'cinema-reveal': c => [keyframes(asset(c, 'hero', { x: 64, y: 64, scale: .86 }), [{ at: 0, x: 70, opacity: 0 }, { at: .3, x: 67, opacity: 1 }, { at: 1, x: 57 }]), camera(c, [{ at: 0, x: 40, scale: 1.14 }, { at: 1, x: 58, scale: 1.04 }])],
  'cinema-closeup': c => [asset(c, 'hero', { x: 62, y: 95, scale: 1.9 }), camera(c, [{ at: 0, x: 49, scale: 1 }, { at: 1, x: 51, y: 49, scale: 1.08 }]), atmosphere(c, 'bokeh', '#ffe5c3')],
  'cinema-two-shot': c => [asset(c, 'hero', { x: 33, y: 64, scale: .88 }), asset(c, 'prop', { x: 68, y: 64, scale: .88 }), camera(c, [{ at: 0, x: 47, scale: 1.04 }, { at: .45, x: 47, scale: 1.06 }, { at: 1, x: 53, scale: 1.06 }])],
  'cinema-detail': c => [asset(c, 'hero', { x: 63, y: 59, scale: 1.35 }), camera(c, [{ at: 0, x: 44, y: 52, scale: 1.28 }, { at: 1, x: 54, y: 48, scale: 1.13 }])],
  'cinema-hero': c => [asset(c, 'hero', { x: 50, y: 66, scale: 1.04 }), camera(c, [{ at: 0, y: 62, scale: 1.17 }, { at: 1, y: 47, scale: 1.02 }]), atmosphere(c, 'embers', '#fbc387')],
  'cinema-isolation': c => [asset(c, 'hero', { x: 48, y: 66, scale: .4 }), camera(c, [{ at: 0, y: 52, scale: 1.35 }, { at: 1, y: 42, scale: 1 }]), atmosphere(c, 'rain')],
  'cinema-tracking': c => [keyframes(asset(c, 'hero', { x: 28, y: 65, scale: .85 }), [{ at: 0, x: 28 }, { at: 1, x: 72 }]), camera(c, [{ at: 0, x: 39, scale: 1.1 }, { at: 1, x: 61, scale: 1.1 }]), atmosphere(c, 'leaves', '#e3a475')],
}
