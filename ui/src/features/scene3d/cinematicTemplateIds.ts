export const CINEMATIC_TEMPLATE_IDS = [
  'face-closeup', 'face-extreme', 'face-profile', 'face-reaction-arc',
  'face-low-angle', 'face-high-angle', 'face-revelation', 'face-to-face',
  'boots-to-face', 'dutch-charge', 'overhead-formation', 'camera-pass',
  'vehicle-showcase', 'vehicle-front-low', 'vehicle-rear-chase', 'vehicle-side-track',
  'vehicle-wheel-detail', 'vehicle-roof-orbit', 'vehicle-convoy', 'vehicle-drift-arc',
] as const

export type CinematicTemplateId = typeof CINEMATIC_TEMPLATE_IDS[number]
