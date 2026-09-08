import { Scene3DMotionControls } from './Scene3DMotionControls'
import { Scene3DScreenControls } from './Scene3DScreenControls'
import { defaultMediaScreen } from './mediaScreen'
import { Scene3DFramingControls } from './Scene3DFramingControls'
import { KineticTextControls } from '../../components/common/KineticTextControls'
import { KineticTextOverlay } from '../../components/common/KineticTextOverlay'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchOutputs, type ApiOutput } from '../../api/client'
import { AssetInput } from '../../features/asset-picker/AssetInput.tsx'
import { useUiTranslation } from '../../i18n'
import { useStore } from '../../stores/useStore'
import { Scene3DTemplateBrowser } from './Scene3DTemplateBrowser'
import { Scene3DAnimationControls } from './Scene3DAnimationControls'
import { Scene3DDocumentControls } from './Scene3DDocumentControls'
import { Scene3DTransport } from './Scene3DTransport'
import { Scene3DTransformPanel } from './Scene3DTransformPanel'
import { Scene3DInteraction } from './Scene3DInteraction'
import type { TransformMode } from './transformGizmo'
import { clipBindingError, resolveScene3DClip, retainSlotClipCatalogs } from './clips.ts'
import { scene3dFrameCount, scene3dFrameTime, scene3dPlaybackSpeed } from './clock.ts'
import { parseScene3DDocument } from './document.ts'
import { canMutateWorld3DScene } from './exportLock.ts'
import { exportWorld3DDocument } from './exportFlow.ts'
import { Scene3DStage, type Scene3DStageHandle } from './Scene3DStage.tsx'
import { applyScene3DTemplate, patchScene3DSlot, remountScene3DTemplate, type Scene3DTemplateId } from './templates.ts'
import { commitSlotSourceChoice, pickerOutputFromSlot, type SlotSourceCapture } from './slotSource.ts'
import type { Scene3DCameraFamily, Scene3DClipCatalogEntry, Scene3DDocument, Scene3DLoop, Scene3DSlot } from './types.ts'
import { documentFromWorld3DRequest, listenForWorld3DWorkflow } from './world3dAgent.ts'

const FAMILIES = ['establishment', 'orbit', 'follow', 'pursuit', 'side', 'front', 'chase', 'hood', 'wing', 'product', 'reveal', 'encounter', 'musical'] as const satisfies readonly Scene3DCameraFamily[]

type Props = {
  width: number
  height: number
}

function revokeIfBlob(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

function numberField(label: string, value: number, onChange: (value: number) => void, step = 0.05, disabled = false) {
  return (
    <label className="flex items-center gap-1 text-[8px] text-text-muted">
      {label}
      <input
        type="number"
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={event => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        className="w-16 rounded border border-border bg-bg-tertiary px-1 py-0.5 text-[9px] text-text-primary disabled:opacity-40"
      />
    </label>
  )
}

export function Scene3DWorkspace({ width, height }: Props) {
  const { t } = useUiTranslation('scene3d')
  const { t: editorT } = useUiTranslation('scene3dEditor')
  const [transformMode, setTransformMode] = useState<TransformMode>('translate')
  const [keepAssets, setKeepAssets] = useState(true)
  const [sceneDoc, setSceneDoc] = useState<Scene3DDocument>(() => ({ ...applyScene3DTemplate('two-shot'), width, height }))
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(0)
  const [selectedId, setSelectedId] = useState('subject_1')
  const frameRef = useRef(0)
  const sceneDocRef = useRef(sceneDoc)
  const [catalogs, setCatalogs] = useState<Record<string, Scene3DClipCatalogEntry[]>>({})
  const [modelItems, setModelItems] = useState<ApiOutput[]>([])
  const [imageItems, setImageItems] = useState<ApiOutput[]>([])
  const [videoItems, setVideoItems] = useState<ApiOutput[]>([])
  const [meshes, setMeshes] = useState<Record<string, string[]>>({})
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const exportingRef = useRef(false)
  const generationRef = useRef(0)
  const workspaceRef = useRef('')
  const stageRef = useRef<Scene3DStageHandle>(null)
  const workspace = useStore(s => s.activeWorkspace)
  const fps = sceneDoc.fps
  const speed = scene3dPlaybackSpeed(sceneDoc.playbackSpeed)
  const count = scene3dFrameCount(sceneDoc.duration, fps)
  const seconds = scene3dFrameTime(frame, sceneDoc.duration, fps)
  const selected = sceneDoc.slots.find(slot => slot.id === selectedId) ?? sceneDoc.slots[0]

  useEffect(() => {
    frameRef.current = frame
  }, [frame])

  useEffect(() => {
    sceneDocRef.current = sceneDoc
  }, [sceneDoc])

  const setExportingFlag = (value: boolean) => {
    exportingRef.current = value
    setExporting(value)
  }

  useEffect(() => {
    const host = window as Window & { __world3dStage?: Scene3DStageHandle | null }
    host.__world3dStage = stageRef.current
    return () => { host.__world3dStage = null }
  })

  useEffect(() => () => {
    for (const slot of sceneDocRef.current.slots) revokeIfBlob(slot.sourceUrl)
  }, [])

  useEffect(() => listenForWorld3DWorkflow(async request => {
    if (!canMutateWorld3DScene(exportingRef.current)) {
      throw new Error('world3d-export-in-progress')
    }
    const next = documentFromWorld3DRequest(request)
    generationRef.current += 1
    setSceneDoc(next)
    setFrame(0)
    return { message: next.templateId, templateId: request.templateId, slotIds: next.slots.map(slot => slot.id) }
  }), [])

  const clipIssue = useMemo(() => {
    for (const slot of sceneDoc.slots) {
      const entries = catalogs[slot.id]
      if (!slot.clip || entries == null) continue
      const error = clipBindingError(resolveScene3DClip(entries, slot.clip))
      if (error) return `${slot.slot}: ${error.message}`
    }
    return null
  }, [catalogs, sceneDoc.slots])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const origin = performance.now()
    const originFrame = frameRef.current
    const tick = () => {
      const elapsed = scene3dFrameTime(originFrame, sceneDoc.duration, fps) + (performance.now() - origin) / 1000 * speed
      const wrapped = elapsed % Math.max(sceneDoc.duration, 0.001)
      const next = Math.min(count - 1, Math.round(wrapped * fps))
      setFrame(current => (current === next ? current : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, sceneDoc.duration, fps, count, speed])

  useEffect(() => {
    if (workspaceRef.current && workspaceRef.current !== workspace) generationRef.current += 1
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    let alive = true
    Promise.all([
      fetchOutputs(200, 0, { mediaType: 'model3d', workspace }),
      fetchOutputs(200, 0, { mediaType: 'image', workspace }),
      fetchOutputs(200, 0, { mediaType: 'video', workspace }),
    ]).then(([models, images, videos]) => {
      if (!alive) return
      setModelItems(models.outputs.filter(item => item.type === 'model3d' && /\.glb$/i.test(item.name)))
      setImageItems(images.outputs.filter(item => item.type === 'image'))
      setVideoItems(videos.outputs.filter(item => item.type === 'video'))
    }).catch(() => {
      if (!alive) return
      setModelItems([])
      setImageItems([])
      setVideoItems([])
    })
    return () => { alive = false }
  }, [workspace])

  const assignChoice = (slot: Scene3DSlot, capture: SlotSourceCapture, item: ApiOutput | null) => {
    const commit = commitSlotSourceChoice({
      generation: generationRef.current,
      slotId: slot.id,
      templateId: sceneDocRef.current.templateId,
      workspaceId: workspaceRef.current || workspace,
      exporting: exportingRef.current,
    }, capture, item)
    if (commit.action === 'ignore') return
    if (!canMutateWorld3DScene(exportingRef.current)) return
    if (commit.action === 'clear') {
      revokeIfBlob(slot.sourceUrl)
      setSceneDoc(current => patchScene3DSlot(current, slot.id, { sourceUrl: '', sourceRef: undefined, clip: null }))
      setCatalogs(current => {
        const next = { ...current }
        delete next[slot.id]
        return next
      })
      return
    }
    revokeIfBlob(slot.sourceUrl)
    setSceneDoc(current => patchScene3DSlot(current, slot.id, {
      sourceUrl: commit.sourceUrl,
      sourceRef: commit.sourceRef,
      media: commit.media,
      clip: commit.clip,
    }))
    setCatalogs(current => {
      const next = { ...current }
      delete next[slot.id]
      return next
    })
  }

  const applyScene = (updater: Parameters<typeof setSceneDoc>[0]) => {
    if (!canMutateWorld3DScene(exportingRef.current)) return
    setSceneDoc(updater)
  }

  const mountTemplate = (id: Scene3DTemplateId) => {
    if (!canMutateWorld3DScene(exportingRef.current)) return
    generationRef.current += 1
    const next = remountScene3DTemplate(id, sceneDoc, keepAssets)
    const keptUrls = new Set(next.slots.map(slot => slot.sourceUrl))
    for (const slot of sceneDoc.slots) if (!keptUrls.has(slot.sourceUrl)) revokeIfBlob(slot.sourceUrl)
    setPlaying(false)
    applyScene(next)
    setCatalogs(current => retainSlotClipCatalogs(sceneDoc.slots, next.slots, current))
    setFrame(0)
    setSelectedId(next.slots.find(slot => slot.media === 'model3d')?.id ?? next.slots[0]?.id ?? 'subject_1')
  }

  const roundtrip = Boolean(parseScene3DDocument(JSON.parse(JSON.stringify(sceneDoc))))

  const exportScene = async () => {
    const stage = stageRef.current
    if (!stage || exportingRef.current || playing) return
    setExportingFlag(true)
    setExportNote(t('stage.exporting'))
    try {
      const result = await exportWorld3DDocument(stage, sceneDoc, workspace, (index, total) => {
        setExportNote(t('stage.exportProgress', { index, total }))
      })
      ;(window as Window & { __world3dLastMp4?: Blob }).__world3dLastMp4 = result.blob
      if (result.saved) setExportNote(t('stage.exported', { name: result.saved.name }))
      else setExportNote(result.error?.message ?? t('stage.exportFailed'))
    } catch (error) {
      setExportNote(error instanceof Error ? error.message : t('stage.exportFailed'))
    } finally {
      setExportingFlag(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid="scene3d-workspace">
      <details className="rounded-xl border border-border bg-bg-secondary">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-text-primary">{editorT('templates')} · {editorT(`template.${sceneDoc.templateId}.title`)}</summary>
      <Scene3DTemplateBrowser selected={sceneDoc.templateId} disabled={exporting} onSelect={mountTemplate} />
      <label className="flex min-h-10 items-center gap-2 px-1 text-xs text-text-secondary"><input type="checkbox" checked={keepAssets} disabled={exporting} onChange={event => setKeepAssets(event.target.checked)} />{editorT('keepAssets')}</label>
      </details>
      <Scene3DDocumentControls document={sceneDoc} disabled={exporting || playing}
        onChange={next => { applyScene(next); setFrame(0) }}
        onLoad={next => {
          if (!canMutateWorld3DScene(exportingRef.current)) return
          generationRef.current += 1
          const keptUrls = new Set(next.slots.map(slot => slot.sourceUrl))
          for (const slot of sceneDoc.slots) if (!keptUrls.has(slot.sourceUrl)) revokeIfBlob(slot.sourceUrl)
          setCatalogs(current => retainSlotClipCatalogs(sceneDoc.slots, next.slots, current))
          setPlaying(false); setFrame(0); applyScene(next)
          setSelectedId(next.slots[0]?.id ?? 'subject_1')
        }} />
      <KineticTextControls cues={sceneDoc.texts} duration={sceneDoc.duration} disabled={exporting || playing} onChange={texts => applyScene(current => ({ ...current, texts }))} />
      <Scene3DTransport playing={playing} disabled={exporting} seconds={seconds} duration={sceneDoc.duration} speed={speed}
        onToggle={() => { if (canMutateWorld3DScene(exportingRef.current)) setPlaying(current => !current) }}
        onSeek={time => { if (exportingRef.current) return; setPlaying(false); setFrame(Math.min(count - 1, Math.max(0, Math.round(time * fps)))) }}
        onSpeed={playbackSpeed => applyScene(current => ({ ...current, playbackSpeed }))} />
      <Scene3DInteraction enabled={!playing && !exporting && Boolean(selected) && selected.media !== 'image'}
        width={sceneDoc.width} height={sceneDoc.height} onMode={setTransformMode}>
        <Scene3DStage
          ref={stageRef}
          document={sceneDoc}
          sceneSeconds={seconds}
          selectedId={selectedId}
          transformMode={transformMode}
          editing={!playing && !exporting}
          onSelect={setSelectedId}
          onTransform={(id, patch) => applyScene(current => patchScene3DSlot(current, id, patch))}
          onSlotClips={(slotId, clips) => setCatalogs(current => ({ ...current, [slotId]: clips }))}
          onSlotMeshes={(slotId, names) => setMeshes(current => ({ ...current, [slotId]: names }))}
        />
        <KineticTextOverlay cues={sceneDoc.texts} seconds={seconds} width={sceneDoc.width} height={sceneDoc.height} />
        {sceneDoc.clipNumber && <div className="pointer-events-none absolute right-3 top-3 z-[901] rounded bg-black/80 px-3 py-2 font-mono text-sm text-cyan-50">CLIP {String(sceneDoc.clipNumber).padStart(2, '0')}</div>}
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/75 px-3 py-2 text-xs text-cyan-200">
          {t('stage.badge')} · {editorT(`template.${sceneDoc.templateId}.title`)}
        </div>
      </Scene3DInteraction>
      {sceneDoc.dressing === 'workshop' && <label className="flex items-center gap-2 text-xs">{editorT('travel.screen')}<select disabled={exporting} value={sceneDoc.workshopScreen ?? 'code'} onChange={event => applyScene(current => ({ ...current, workshopScreen: event.target.value as 'code' | 'error' | 'success' }))} className="min-h-10 rounded border border-border bg-bg-tertiary px-2">{(['code', 'error', 'success'] as const).map(state => <option key={state} value={state}>{editorT(`travel.${state}`)}</option>)}</select></label>}
      <Scene3DFramingControls framing={sceneDoc.camera.framing} slots={sceneDoc.slots} disabled={exporting || playing} onChange={framing => applyScene(current => ({ ...current, camera: { ...current.camera, framing } }))} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-text-primary">{editorT('camera')}
          <select disabled={exporting} value={sceneDoc.camera.family} onChange={event => applyScene(current => ({ ...current, camera: { ...current.camera, family: event.target.value as Scene3DCameraFamily, framing: undefined } }))}
            className="min-h-11 rounded-lg border border-border bg-bg-primary px-3 text-xs disabled:opacity-40">
            {FAMILIES.map(family => <option key={family} value={family}>{t(`stage.family.${family}`)}</option>)}
          </select>
        </label>
        <button
          type="button"
          data-testid="world3d-export"
          disabled={exporting || playing || Boolean(clipIssue)}
          onClick={() => void exportScene()}
          className="ml-auto min-h-11 rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-4 text-xs font-semibold text-cyan-100 disabled:opacity-40"
        >
          {exporting ? t('stage.exporting') : t('stage.export')}
        </button>
      </div>
      {selected && <Scene3DTransformPanel slot={selected} mode={transformMode} disabled={exporting || playing} onMode={setTransformMode}
        onChange={patch => applyScene(current => patchScene3DSlot(current, selected.id, patch))}
        onReset={() => {
          const pose = applyScene3DTemplate(sceneDoc.templateId).slots.find(slot => slot.id === selected.id)
          if (pose) applyScene(current => patchScene3DSlot(current, selected.id, { position: pose.position, scale: pose.scale, rotationY: pose.rotationY }))
        }} />}
      {selected && selected.media !== 'image' && <Scene3DMotionControls slot={selected} duration={sceneDoc.duration / speed} disabled={exporting || playing} onChange={patch => applyScene(current => patchScene3DSlot(current, selected.id, patch))} />}
      <button type="button" disabled={exporting || playing || sceneDoc.slots.length >= 64} className="min-h-11 self-start rounded-lg border border-cyan-400/50 px-4 text-sm text-text-primary" onClick={() => {
        if (!canMutateWorld3DScene(exportingRef.current)) return
        const id = `screen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
        applyScene(current => ({ ...current, slots: [...current.slots, { id, slot: 'prop', media: 'screen', sourceUrl: '', clip: null, position: [0, 0, -2], rotationY: 0, scale: 1, screen: defaultMediaScreen() }] }))
        setSelectedId(id)
      }}>{editorT('screens.add')}</button>
      <div className="grid gap-1.5 md:grid-cols-2">
        {sceneDoc.slots.map(slot => {
          const capture: SlotSourceCapture = {
            generation: generationRef.current,
            slotId: slot.id,
            templateId: sceneDoc.templateId,
            workspaceId: workspace,
          }
          return (
            <div key={slot.id} className={`rounded-xl border p-3 text-xs text-text-secondary ${selectedId === slot.id ? 'border-cyan-300 bg-cyan-400/5' : 'border-border bg-bg-primary'}`}>
              <button type="button" className="block min-h-10 font-semibold text-text-primary" onClick={() => setSelectedId(slot.id)}>{t(`stage.slot.${slot.slot}`)}</button>
              {slot.media !== 'screen' && <div className="mt-1">
                <AssetInput
                  label={t(`stage.slot.${slot.slot}`)}
                  placeholder={t('stage.fromApp')}
                  items={slot.slot === 'background' ? imageItems : modelItems}
                  value={pickerOutputFromSlot(slot.sourceUrl, slot.media, slot.sourceRef)}
                  accept={slot.slot === 'background' ? 'image/*' : '.glb,model/gltf-binary'}
                  optional
                  disabled={exporting}
                  constraints={{
                    kinds: slot.slot === 'background' ? ['image'] : ['model3d'],
                    maxCount: 1,
                    optional: true,
                  }}
                  onChoose={item => assignChoice(slot, capture, item)}
                />
              </div>}
              <Scene3DScreenControls slot={slot} meshes={meshes[slot.id] ?? []} items={[...imageItems, ...videoItems]} disabled={exporting || playing}
                onChange={screen => applyScene(current => patchScene3DSlot(current, slot.id, { screen }))}
                onChoose={item => {
                  if (item && item.type !== 'image' && item.type !== 'video') return
                  const commit = commitSlotSourceChoice({ generation: generationRef.current, slotId: slot.id, templateId: sceneDocRef.current.templateId, workspaceId: workspaceRef.current || workspace, exporting: exportingRef.current }, capture, item)
                  if (commit.action === 'ignore') return
                  applyScene(current => {
                    const live = current.slots.find(value => value.id === slot.id)
                    if (!live?.screen) return current
                    return patchScene3DSlot(current, slot.id, { screen: { ...live.screen, sourceUrl: commit.action === 'clear' ? '' : commit.sourceUrl,
                      sourceRef: commit.action === 'clear' ? undefined : commit.sourceRef, media: item?.type === 'video' ? 'video' : 'image' } })
                  })
                }}
                onRemove={() => { generationRef.current += 1; applyScene(current => ({ ...current, slots: current.slots.filter(value => value.id !== slot.id), camera: current.camera.framing?.targetSlot === slot.id ? { ...current.camera, framing: undefined } : current.camera })) }} />
              <Scene3DAnimationControls slot={slot} clips={catalogs[slot.id]} disabled={exporting || playing}
                onChange={patch => applyScene(current => patchScene3DSlot(current, slot.id, patch))} />
              {slot.slot === 'background' && <label className="my-2 flex min-h-9 items-center gap-2 text-xs"><span>{editorT('travel.surface')}</span><select disabled={exporting} value={slot.surface ?? 'backdrop'} onChange={event => applyScene(current => patchScene3DSlot(current, slot.id, { surface: event.target.value === 'backdrop' ? undefined : event.target.value as 'floor' | 'wall', loop: undefined }))} className="rounded border border-border bg-bg-tertiary p-2"><option value="backdrop">{editorT('travel.backdrop')}</option><option value="wall">{editorT('travel.wall')}</option><option value="floor">{editorT('travel.floor')}</option></select></label>}
              {slot.slot === 'background' && slot.surface && numberField(editorT('travel.repeat'), slot.textureRepeat ?? (slot.surface === 'floor' ? 4 : 2), value => applyScene(current => patchScene3DSlot(current, slot.id, { textureRepeat: Math.max(1, Math.min(16, value)) })), 1, exporting)}
              {slot.slot === 'background' && slot.surface !== 'floor' && (
                <InfiniteBackdropControls
                  loop={slot.loop}
                  disabled={exporting}
                  infiniteLabel={t('stage.infinite')}
                  speedLabel={t('stage.loopSpeed')}
                  onChange={loop => applyScene(current => patchScene3DSlot(current, slot.id, {
                    media: 'image',
                    loop,
                    ...(loop.cylinder && slot.scale > 2 ? { scale: 1 } : {}),
                  }))}
                />
              )}
            </div>
          )
        })}
      </div>
      {clipIssue && <p className="text-xs text-red-300">{clipIssue}</p>}
      {exportNote && <p className="text-xs text-cyan-100" data-testid="world3d-export-note">{exportNote}</p>}
      <p className="text-xs text-text-muted">{sceneDoc.templateId === 'run-loop' ? t('stage.runHelp') : t('stage.help')}</p>
      <span data-testid="scene3d-roundtrip" className="hidden">{roundtrip ? 'ok' : 'bad'}</span>
    </div>
  )
}

function InfiniteBackdropControls({
  loop,
  infiniteLabel,
  speedLabel,
  onChange,
  disabled = false,
}: {
  loop: Scene3DLoop | undefined
  infiniteLabel: string
  speedLabel: string
  onChange: (loop: Scene3DLoop) => void
  disabled?: boolean
}) {
  const speed = loop?.speed ?? 0.18
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <label className="flex items-center gap-1 text-[8px] text-text-muted">
        <input
          type="checkbox"
          data-testid="scene3d-infinite"
          disabled={disabled}
          checked={loop?.cylinder === true}
          onChange={event => onChange({ cylinder: event.target.checked, speed })}
        />
        {infiniteLabel}
      </label>
      {loop?.cylinder === true && numberField(speedLabel, speed, value => onChange({ cylinder: true, speed: value }), 0.01, disabled)}
    </div>
  )
}
