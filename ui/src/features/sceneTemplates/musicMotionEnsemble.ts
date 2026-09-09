import type { SceneLayer } from '../../types'
import { asset, atmosphere, keyframes, type BuildContext } from './sceneBuilders'
import { copySubject, movingSubject, sampledPath } from './musicMotionBuilders'

export const musicMotionEnsemble: Record<string, (c: BuildContext) => SceneLayer[]> = {
  'music-orbit-duel': c => ['subject_1', 'subject_2'].map((slot, index) => movingSubject(c, sampledPath(32, at => ({
    x: 50 + 27 * Math.cos(at * Math.PI * 2 + index * Math.PI),
    y: 53 + 19 * Math.sin(at * Math.PI * 2 + index * Math.PI), scale: .55, rotation: 0,
  })), slot as 'subject_1' | 'subject_2')),
  'music-high-five': c => [
    movingSubject(c, [{ at: 0, x: 15, scale: .65, rotation: -8 }, { at: .45, x: 38, y: 47, scale: .65, rotation: 8 }, { at: .65, x: 33, scale: .65, rotation: -5 }, { at: 1, x: 33, scale: .65, rotation: 0 }]),
    movingSubject(c, [{ at: 0, x: 85, scale: .65, rotation: 8 }, { at: .45, x: 62, y: 47, scale: .65, rotation: -8 }, { at: .65, x: 67, scale: .65, rotation: 5 }, { at: 1, x: 67, scale: .65, rotation: 0 }], 'subject_2'),
    atmosphere(c, 'sparkles'),
  ],
  'music-magnet-pull': c => [
    movingSubject(c, [{ at: 0, x: 25, scale: .65 }, { at: .5, x: 27, scale: .65, rotation: 5 }, { at: 1, x: 26, scale: .65 }]),
    movingSubject(c, [{ at: 0, x: 95, scale: .55, rotation: -12, curve: 'dramatic' }, { at: .6, x: 48, scale: .65, rotation: 8 }, { at: .78, x: 57, scale: .65, rotation: -5 }, { at: 1, x: 51, scale: .65 }], 'subject_2'),
  ],
  'music-ricochet-pass': c => [asset(c, 'subject_1', { x: 50, y: 62, scale: .7 }), keyframes(asset(c, 'prop_1', { scale: .18 }, 20), [
    { at: 0, x: 30, y: 56, curve: 'linear' }, { at: .2, x: 88, y: 23, curve: 'linear' },
    { at: .4, x: 12, y: 33, curve: 'linear' }, { at: .6, x: 86, y: 77, curve: 'linear' },
    { at: .8, x: 15, y: 65, curve: 'linear' }, { at: 1, x: 33, y: 53 },
  ])],
  'music-portal-swap': c => [
    movingSubject(c, [{ at: 0, x: 24, scale: .68 }, { at: .3, x: 28, scale: .68 }, { at: .46, x: 28, scale: .01, opacity: 0, curve: 'hold' }, { at: .54, x: 72, scale: .01, opacity: 0 }, { at: .72, x: 72, scale: .68 }, { at: 1, x: 76, scale: .68 }]),
    movingSubject(c, [{ at: 0, x: 76, scale: .68 }, { at: .3, x: 72, scale: .68 }, { at: .46, x: 72, scale: .01, opacity: 0, curve: 'hold' }, { at: .54, x: 28, scale: .01, opacity: 0 }, { at: .72, x: 28, scale: .68 }, { at: 1, x: 24, scale: .68 }], 'subject_2'),
    atmosphere(c, 'sparkles'),
  ],
  'music-spotlight-relay': c => [
    movingSubject(c, [{ at: 0, x: 28, scale: .9 }, { at: .3, x: 28, scale: .9 }, { at: .6, x: 25, scale: .48, opacity: .4 }, { at: 1, x: 25, scale: .48, opacity: .4 }]),
    movingSubject(c, [{ at: 0, x: 75, scale: .48, opacity: .4 }, { at: .3, x: 75, scale: .48, opacity: .4 }, { at: .6, x: 72, scale: .9 }, { at: 1, x: 72, scale: .9 }], 'subject_2'),
    atmosphere(c, 'bokeh'),
  ],
  'music-staircase-pop': c => [movingSubject(c, [
    { at: 0, x: 15, y: 80, scale: .38, curve: 'hold' }, { at: .2, x: 32, y: 65, scale: .5, curve: 'hold' },
    { at: .4, x: 48, y: 51, scale: .62, curve: 'hold' }, { at: .6, x: 65, y: 38, scale: .74, curve: 'hold' },
    { at: .8, x: 79, y: 24, scale: .85 }, { at: 1, x: 68, y: 43, scale: .9 },
  ])],
  'music-accordion-clones': c => Array.from({ length: 5 }, (_, i) => copySubject(c, i, [
    { at: 0, x: 50, scale: .45, opacity: i === 0 ? 1 : 0 },
    { at: .3, x: 50 + (i - 2) * 18, scale: .45, rotation: (i - 2) * 6 },
    { at: .65, x: 50 + (i - 2) * 18, scale: .45, rotation: -(i - 2) * 6 },
    { at: 1, x: 50, scale: .45, opacity: i === 0 ? 1 : 0 },
  ])),
  'music-domino-wave': c => Array.from({ length: 5 }, (_, i) => copySubject(c, i, [
    { at: 0, x: 14 + i * 18, y: 62, scale: .36, rotation: 0 },
    { at: .1 + i * .12, x: 14 + i * 18, y: 62, scale: .36, rotation: 0 },
    { at: .22 + i * .12, x: 14 + i * 18, y: 62, scale: .36, rotation: 65 },
    { at: .4 + i * .12, x: 14 + i * 18, y: 62, scale: .36, rotation: 0 },
    { at: 1, x: 14 + i * 18, y: 62, scale: .36, rotation: 0 },
  ])),
  'music-conveyor': c => Array.from({ length: 4 }, (_, i) => copySubject(c, i, [
    { at: 0, x: 25 + i * 38, y: 57, scale: .5, curve: 'linear' },
    { at: 1, x: -100 + i * 38, y: 57, scale: .5 },
  ])),
  'music-satellite-swarm': c => {
    const prop = asset(c, 'prop_1', { scale: .17 }, 12)
    prop.animation.orbit = { targetLayerId: 'subject_1', radiusX: 33, radiusY: 26, turns: 1.5, phase: 0, count: 5, facing: 'fixed' }
    return [movingSubject(c, [{ at: 0, scale: .62 }, { at: .5, scale: .78 }, { at: 1, scale: .62 }]), prop]
  },
  'music-crowd-surf': c => [movingSubject(c, sampledPath(24, at => ({
    x: 12 + 76 * at, y: 40 + 4 * Math.sin(at * Math.PI * 4), scale: .64, rotation: 75 + 6 * Math.sin(at * Math.PI * 4),
  }))), ...Array.from({ length: 5 }, (_, i) => copySubject(c, i, sampledPath(16, at => ({
    x: 10 + i * 20, y: 87 - 4 * Math.sin(at * Math.PI * 4 + i), scale: .4,
  })), 'prop_1'))],
}
