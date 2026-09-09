import {
  BookOpen, Boxes, ChevronRight, Film, ImagePlus, Music, Play, Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import type { StoryLabTab } from './storyLabChrome'
import type { StoryProjectType } from './types'

export const STORY_PROJECT_TYPE_IDS: readonly StoryProjectType[] = [
  'full_story', 'music_video', 'trailer', 'quick_video',
]

type StoryLabT = TFunction<'storyLab'>
type TabLabelKey =
  | 'tabs.story' | 'tabs.assets' | 'tabs.images' | 'tabs.world' | 'tabs.characters'
  | 'tabs.music' | 'tabs.song' | 'tabs.relationships' | 'tabs.structure' | 'tabs.trailer'
  | 'tabs.createTrailer' | 'tabs.productions' | 'tabs.generate' | 'tabs.assembly'
  | 'tabs.musicVideo' | 'tabs.quickVideo' | 'tabs.universe' | 'tabs.script' | 'tabs.audio'
  | 'tabs.results' | 'tabs.ideaAndRefs' | 'tabs.concept' | 'tabs.references'
  | 'tabs.ideaAndDialogue'
type TabSpec = { id: StoryLabTab; labelKey: TabLabelKey; icon: LucideIcon }

const PROJECT_TYPE_COPY: Record<StoryProjectType, {
  label: `projectTypes.${StoryProjectType}.label`
  description: `projectTypes.${StoryProjectType}.description`
}> = {
  full_story: { label: 'projectTypes.full_story.label', description: 'projectTypes.full_story.description' },
  music_video: { label: 'projectTypes.music_video.label', description: 'projectTypes.music_video.description' },
  trailer: { label: 'projectTypes.trailer.label', description: 'projectTypes.trailer.description' },
  quick_video: { label: 'projectTypes.quick_video.label', description: 'projectTypes.quick_video.description' },
}

const FULL_STORY_TABS: TabSpec[] = [
  { id: 'overview', labelKey: 'tabs.story', icon: BookOpen },
  { id: 'world', labelKey: 'tabs.universe', icon: Boxes },
  { id: 'structure', labelKey: 'tabs.script', icon: ChevronRight },
  { id: 'music', labelKey: 'tabs.audio', icon: Music },
  { id: 'productions', labelKey: 'tabs.generate', icon: Sparkles },
  { id: 'assembly', labelKey: 'tabs.results', icon: Play },
]

const MUSIC_VIDEO_TABS: TabSpec[] = [
  { id: 'overview', labelKey: 'tabs.ideaAndRefs', icon: Film },
  { id: 'music', labelKey: 'tabs.song', icon: Music },
  { id: 'productions', labelKey: 'tabs.generate', icon: Sparkles },
  { id: 'assembly', labelKey: 'tabs.results', icon: Play },
]

const TRAILER_TABS: TabSpec[] = [
  { id: 'overview', labelKey: 'tabs.concept', icon: Film },
  { id: 'assets', labelKey: 'tabs.references', icon: ImagePlus },
  { id: 'trailer', labelKey: 'tabs.generate', icon: Sparkles },
  { id: 'assembly', labelKey: 'tabs.results', icon: Play },
]

const QUICK_VIDEO_TABS: TabSpec[] = [
  { id: 'overview', labelKey: 'tabs.ideaAndDialogue', icon: Film },
  { id: 'productions', labelKey: 'tabs.generate', icon: Sparkles },
  { id: 'assembly', labelKey: 'tabs.results', icon: Play },
]

const TABS_BY_TYPE: Record<StoryProjectType, TabSpec[]> = {
  full_story: FULL_STORY_TABS,
  music_video: MUSIC_VIDEO_TABS,
  trailer: TRAILER_TABS,
  quick_video: QUICK_VIDEO_TABS,
}

export function storyProjectTypes(t: StoryLabT): Array<{
  id: StoryProjectType
  label: string
  description: string
}> {
  return STORY_PROJECT_TYPE_IDS.map(id => ({
    id,
    label: t(PROJECT_TYPE_COPY[id].label),
    description: t(PROJECT_TYPE_COPY[id].description),
  }))
}

export function storyLabTabIds(projectType: StoryProjectType): StoryLabTab[] {
  return (TABS_BY_TYPE[projectType] || TABS_BY_TYPE.full_story).map(item => item.id)
}

export function storyLabTabs(
  projectType: StoryProjectType,
  t: StoryLabT,
): Array<{ id: StoryLabTab; label: string; icon: LucideIcon }> {
  return TABS_BY_TYPE[projectType].map(item => ({
    id: item.id,
    label: t(item.labelKey),
    icon: item.icon,
  }))
}
