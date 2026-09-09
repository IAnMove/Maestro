import scene3dEn from './locales/en/scene3d.json'
import scene3dEs from './locales/es/scene3d.json'
import type { UiLanguage } from './resources'

export function animatorLabels(language: UiLanguage = 'en') {
  return language === 'es' ? scene3dEs.animator : scene3dEn.animator
}
