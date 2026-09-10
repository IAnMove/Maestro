import {
  applySeriesPlan,
  assembleSeriesEpisode,
  commitSeriesCanonDelta,
  createFilledSeriesEpisode,
  generateSeriesPlan,
  renderSeriesShots,
  reviewSeriesAttempts,
  stageSeriesComic as stageSeriesComicAction,
  updateSeriesEpisode,
} from './actions'
import { normalizeName } from '../../lib/labHelpers'
import { useSeriesStore } from './store'
import type {
  ApplySeriesPlanCommand,
  AssembleSeriesEpisodeCommand,
  CommitSeriesCanonCommand,
  CreateSeriesEpisodeCommand,
  GenerateSeriesPlanCommand,
  RenderSeriesShotsCommand,
  ReviewSeriesAttemptsCommand,
  StageSeriesComicCommand,
  UpdateSeriesEpisodeCommand,
} from './commands'

export async function createEpisode(command: CreateSeriesEpisodeCommand) {
  return createFilledSeriesEpisode(command)
}

export async function updateEpisode(command: UpdateSeriesEpisodeCommand) {
  return updateSeriesEpisode(command)
}

export async function generatePlan(command: GenerateSeriesPlanCommand) {
  return generateSeriesPlan(command)
}

export async function applyPlan(command: ApplySeriesPlanCommand) {
  return applySeriesPlan(command)
}

export async function renderShots(command: RenderSeriesShotsCommand) {
  return renderSeriesShots(command)
}

export async function reviewAttempts(command: ReviewSeriesAttemptsCommand) {
  return reviewSeriesAttempts(command)
}

export async function assembleEpisode(command: AssembleSeriesEpisodeCommand) {
  return assembleSeriesEpisode(command)
}

export function resolveSeriesComicCommand(action: {
  seriesId?: string
  episodeId?: string
  seriesTitle?: string
  targetEpisodeTitle?: string
  title?: string
  pageCount?: number
  panelsPerPage?: number
  confirm: true
}): StageSeriesComicCommand {
  const store = useSeriesStore.getState()
  const library = store.library
  const seriesTitle = action.seriesTitle?.trim() || ''
  const episodeTitle = action.targetEpisodeTitle?.trim() || ''
  const requestedSeries = action.seriesId ? library.seriesById[action.seriesId] : undefined
  const seriesMatches = !requestedSeries && seriesTitle
    ? Object.values(library.seriesById).filter(item => normalizeName(item.title) === normalizeName(seriesTitle))
    : []
  if (seriesMatches.length > 1) {
    throw new Error(`Hay varias series tituladas “${seriesTitle}”; nombra el id exacto o renombra una.`)
  }
  const series = requestedSeries
    || seriesMatches[0]
    || (!seriesTitle && !action.seriesId ? library.seriesById[store.activeSeriesId] : undefined)
  if (!series) {
    throw new Error(seriesTitle
      ? `No existe la serie “${seriesTitle}” en este workspace.`
      : 'No hay una serie activa ni un título exacto para adaptar a cómic.')
  }
  const requestedEpisode = action.episodeId ? series.episodesById[action.episodeId] : undefined
  const episodeMatches = !requestedEpisode && episodeTitle
    ? Object.values(series.episodesById).filter(item => normalizeName(item.title) === normalizeName(episodeTitle))
    : []
  if (episodeMatches.length > 1) {
    throw new Error(`Hay varios episodios titulados “${episodeTitle}”; nombra el id exacto.`)
  }
  const episode = requestedEpisode
    || episodeMatches[0]
    || (!episodeTitle && !action.episodeId ? series.episodesById[store.activeEpisodeId] : undefined)
  if (!episode) {
    throw new Error(episodeTitle
      ? `No existe el episodio “${episodeTitle}” en “${series.title}”.`
      : 'No hay un episodio activo ni un título exacto para adaptar a cómic.')
  }
  return {
    seriesId: series.id,
    episodeId: episode.id,
    title: action.title,
    pageCount: action.pageCount,
    panelsPerPage: action.panelsPerPage,
    actor: 'wizard',
    confirm: true,
  }
}

export async function stageSeriesComic(command: StageSeriesComicCommand) {
  return stageSeriesComicAction(command)
}

export async function commitCanon(command: CommitSeriesCanonCommand) {
  return commitSeriesCanonDelta(command)
}
