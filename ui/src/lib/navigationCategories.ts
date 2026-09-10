import type { GenerationMode, MediaFilter } from '../types'

export const NAVIGATION_CATEGORIES = [
  'direct-generation', 'studios', 'production', 'media',
] as const

export type NavigationCategory = typeof NAVIGATION_CATEGORIES[number]

export const DIRECT_GENERATION_MEDIA: Record<GenerationMode, MediaFilter> = {
  image: 'images',
  video: 'videos',
  audio: 'audio',
  model3d: 'model3d',
  avatar: 'avatars',
  tools: 'all',
}

const STUDIOS = new Set<MediaFilter>([
  'stories', 'series', 'comics', 'scene3d', 'world3d', 'animate3d', 'characters', 'character-replacement',
])
const PRODUCTION = new Set<MediaFilter>(['videoeditor'])
const MEDIA = new Set<MediaFilter>([
  'all', 'assets', 'projects', 'images', 'videos', 'videoclips', 'trailers',
  'series_episodes', 'audio', 'model3d', 'scenes', 'styles', 'avatars',
  'multiclip', 'favorites', 'auditdev',
])

export function categoryForMediaFilter(filter: MediaFilter): NavigationCategory | null {
  if (STUDIOS.has(filter)) return 'studios'
  if (PRODUCTION.has(filter)) return 'production'
  if (MEDIA.has(filter)) return 'media'
  return null
}

/** Direct generation lives in its own top-level destination. Studio workspaces
 *  already have large controls. Comic Director is the exception: it is the
 *  comics workspace plus the Director sidebar. */
export function hidesDirectGenerationSidebar(filter: MediaFilter, sidebarMode: 'studio' | 'director'): boolean {
  if (!STUDIOS.has(filter)) return false
  if (sidebarMode === 'director' && filter === 'comics') return false
  return true
}

export function categoryForNavigationDestination(destination: string): NavigationCategory | null {
  if (destination === 'studio') return 'direct-generation'
  if (destination === 'director' || destination === 'productions' || destination === 'video_editor') return 'production'
  if (['story_lab', 'series_lab', 'comics', 'video_3d', 'world_3d', 'animate_3d', 'character_creator', 'character_kit'].includes(destination)) return 'studios'
  if (['images', 'videos', 'audio', '3d'].includes(destination)) return 'media'
  return null
}

export const WIZARD_NAVIGATION_EVENT = 'hocuspocus:wizard-navigation'

export function announceWizardNavigation(destination: string): void {
  if (typeof window === 'undefined') return
  const category = categoryForNavigationDestination(destination)
  if (!category) return
  window.dispatchEvent(new window.CustomEvent(WIZARD_NAVIGATION_EVENT, {
    detail: { category, destination },
  }))
}
