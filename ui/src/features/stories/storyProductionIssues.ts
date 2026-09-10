import type { TFunction } from 'i18next'
import { resolveStoryLabNavigation } from './labNavigation'
import type { ProductionReviewIssue } from './storyLabChrome'
import {
  approvedAttachedReferenceCount,
  charactersMissingVisualIdentities,
  storyRecipeRequiresApprovedReferences,
  storyRecipeRequiresVisualIdentities,
} from './storyVisualGuidance'
import type { StoryMusicVideoGenerationMode, StoryProject } from './types'

type StoryLabT = TFunction<'storyLab'>

function isApproved(project: StoryProject, key: keyof StoryProject['approvals']): boolean {
  return project.approvals[key]?.version === project.sectionVersions[key]
}

function issueForSection(
  project: StoryProject,
  section: keyof StoryProject['approvals'],
  label: string,
  detail: string,
): ProductionReviewIssue {
  const resolved = resolveStoryLabNavigation(section, project.projectType)
  return {
    id: `section:${section}`,
    label,
    detail,
    tab: resolved.ok ? resolved.tab : 'overview',
    anchorId: resolved.ok ? resolved.anchor : `story-review-${section}`,
  }
}

function sectionLabels(project: StoryProject, t: StoryLabT): Record<keyof StoryProject['approvals'], string> {
  const music = project.projectType === 'music_video'
  const trailer = project.projectType === 'trailer'
  return {
    overview: music ? t('issues.approveSongAndVisual') : trailer ? t('issues.approveTrailerConcept') : t('issues.approveConcept'),
    world: music ? t('issues.approveMusicWorld') : trailer ? t('issues.approveTrailerWorld') : t('issues.approveWorld'),
    characters: trailer ? t('issues.approveLeads') : t('issues.approveCast'),
    relationships: t('issues.approveRelationships'),
    structure: music ? t('issues.approveVisualMoments') : trailer ? t('issues.approveTrailerArc') : t('issues.approveStructure'),
  }
}

function collectTechnicalRecipeIssues(
  project: StoryProject,
  recipeMode: StoryMusicVideoGenerationMode,
  t: StoryLabT,
): ProductionReviewIssue[] {
  const issues: ProductionReviewIssue[] = []
  if (storyRecipeRequiresApprovedReferences(recipeMode) && approvedAttachedReferenceCount(project) === 0) {
    const resolved = resolveStoryLabNavigation('assets', project.projectType)
    issues.push({
      id: 'recipe:references',
      label: t('issues.technicalMissingRefs'),
      detail: t('issues.referencesDetail'),
      tab: resolved.ok ? resolved.tab : 'overview',
      anchorId: resolved.ok ? resolved.anchor : 'story-review-assets',
    })
  }
  if (!storyRecipeRequiresVisualIdentities(recipeMode)) return issues
  const missingIdentities = charactersMissingVisualIdentities(project)
  if (!missingIdentities.length) return issues
  const charactersNav = resolveStoryLabNavigation('characters', project.projectType)
  issues.push({
    id: 'recipe:identities',
    label: t('issues.reviewIdentities', {
      names: missingIdentities.map(character => character.name || t('issues.unnamed')).join(', '),
    }),
    detail: t('issues.identitiesDetail'),
    tab: charactersNav.ok ? charactersNav.tab : 'overview',
    anchorId: `story-review-character-${missingIdentities[0].id}`,
  })
  return issues
}

function collectEditorialReviewIssues(
  project: StoryProject,
  recipeMode: StoryMusicVideoGenerationMode,
  t: StoryLabT,
): ProductionReviewIssue[] {
  const requiresVisualIdentities = storyRecipeRequiresVisualIdentities(recipeMode)
  const missingIdentities = requiresVisualIdentities ? charactersMissingVisualIdentities(project) : []
  const incompleteCharacters = project.characters.filter(character =>
    character.approval !== 'approved'
    || (requiresVisualIdentities && (
      !character.primaryReferenceAssetId
      || project.assets[character.primaryReferenceAssetId]?.approval !== 'approved'
    )))
  const required: Array<keyof StoryProject['approvals']> = ['overview', 'world', 'characters', 'structure']
  if (project.projectType === 'full_story' && project.relationships.length) required.push('relationships')
  const labels = sectionLabels(project, t)
  const issues = required
    .filter(section => section !== 'characters' && !isApproved(project, section))
    .map(section => issueForSection(project, section, labels[section], t('issues.openSectionDetail')))
  const charactersNav = resolveStoryLabNavigation('characters', project.projectType)
  const charactersTab = charactersNav.ok ? charactersNav.tab : 'overview'
  if (incompleteCharacters.length && !missingIdentities.length) {
    const names = incompleteCharacters.map(character => character.name || t('issues.unnamed')).join(', ')
    issues.push({
      id: 'characters:items',
      label: requiresVisualIdentities ? t('issues.reviewIdentities', { names }) : t('issues.approveDescriptions', { names }),
      detail: requiresVisualIdentities ? t('issues.identitiesDetail') : t('issues.descriptionsDetail'),
      tab: charactersTab,
      anchorId: `story-review-character-${incompleteCharacters[0].id}`,
    })
  } else if (!isApproved(project, 'characters') && !missingIdentities.length) {
    issues.push(issueForSection(project, 'characters', labels.characters, t('issues.confirmSetDetail')))
  }
  return issues
}

export function collectStoryProductionIssues(
  project: StoryProject,
  recipeMode: StoryMusicVideoGenerationMode,
  t: StoryLabT,
): ProductionReviewIssue[] {
  const technical = collectTechnicalRecipeIssues(project, recipeMode, t)
  if (project.workflowMode === 'automatic') return technical
  return [...technical, ...collectEditorialReviewIssues(project, recipeMode, t)]
}
