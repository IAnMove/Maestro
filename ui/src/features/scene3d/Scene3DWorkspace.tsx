import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchOutputs, type ApiOutput } from '../../api/client'
import { AssetExplorerDialog } from '../../components/common/AssetExplorerDialog'
import { useUiTranslation } from '../../i18n'
import { useStore } from '../../stores/useStore'
import { cameraEyeAtTime, projectPoint } from './camera.ts'
import { clipBindingError, resolveScene3DClip } from './clips.ts'
import { scene3dFrameCount, scene3dFrameTime } from './clock.ts'
import { parseScene3DDocument } from './document.ts'
import { exportWorld3DDocument } from './exportFlow.ts'
import { Scene3DStage, type Scene3DStageHandle } from './Scene3DStage.tsx'
import { applyScene3DTemplate, patchScene3DSlot, SCENE3D_TEMPLATES, type Scene3DTemplateId } from './templates.ts'
import type { Scene3DCameraFamily, Scene3DClipCatalogEntry, Scene3DDocument, Scene3DLoop, Scene3DSlot } from './types.ts'
import { documentFromWorld3DRequest, listenForWorld3DWorkflow } from './world3dAgent.ts'

const FAMILIES = ['establishment', 'orbit', 'follow', 'pursuit', 'product', 'reveal', 'encounter', 'musical'] as const satisfies readonly Scene3DCameraFamily[]

type Props = {
  width: number
  height: number
}

function revokeIfBlob(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

function numberField(label: string, value: number, onChange: (value: number) => void, step = 0.05) {
  return (
    <label className="flex items-center gap-1 text-[8px] text-text-muted">
      {label}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={event => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        className="w-16 rounded border border-border bg-bg-tertiary px-1 py-0.5 text-[9px] text-text-primary"
      />
    </label>
  )
}

export function Scene3DWorkspace({ width, height }: Props) {
  const { t } = useUiTranslation('scene3d')
  const [sceneDoc, setSceneDoc] = useState<Scene3DDocument>(() => applyScene3DTemplate('two-shot'))
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(0)
  const [selectedId, setSelectedId] = useState('subject_1')
  const frameRef = useRef(0)
  const sceneDocRef = useRef(sceneDoc)
  const dragRef = useRef<{ id: string; startX: number; startZ: number; pointerX: number; pointerY: number } | null>(null)
  const [catalogs, setCatalogs] = useState<Record<string, Scene3DClipCatalogEntry[]>>({})
  const [explorerSlot, setExplorerSlot] = useState<string | null>(null)
  const [explorerItems, setExplorerItems] = useState<ApiOutput[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const stageRef = useRef<Scene3DStageHandle>(null)
  const workspace = useStore(s => s.activeWorkspace)
  const fps = sceneDoc.fps
  const count = scene3dFrameCount(sceneDoc.duration, fps)
  const seconds = scene3dFrameTime(frame, sceneDoc.duration, fps)
  const selected = sceneDoc.slots.find(slot => slot.id === selectedId) ?? sceneDoc.slots[0]

  useEffect(() => {
    frameRef.current = frame
  }, [frame])

  useEffect(() => {
    sceneDocRef.current = sceneDoc
  }, [sceneDoc])

  useEffect(() => {
    const host = window as Window & { __world3dStage?: Scene3DStageHandle | null }
    host.__world3dStage = stageRef.current
    return () => { host.__world3dStage = null }
  })

  useEffect(() => () => {
    for (const slot of sceneDocRef.current.slots) revokeIfBlob(slot.sourceUrl)
  }, [])

  useEffect(() => listenForWorld3DWorkflow(async request => {
    const next = documentFromWorld3DRequest(request)
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
      const elapsed = scene3dFrameTime(originFrame, sceneDoc.duration, fps) + (performance.now() - origin) / 1000
      const wrapped = elapsed % Math.max(sceneDoc.duration, 0.001)
      const next = Math.min(count - 1, Math.round(wrapped * fps))
      setFrame(current => (current === next ? current : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, sceneDoc.duration, fps, count])

  const assignSource = (slotId: string, url: string, media: Scene3DSlot['media'] = 'model3d') => {
    setSceneDoc(current => patchScene3DSlot(current, slotId, { sourceUrl: url, media, clip: null }))
    setCatalogs(current => {
      const next = { ...current }
      delete next[slotId]
      return next
    })
  }

  const openExplorer = async (slot: Scene3DSlot) => {
    setExplorerSlot(slot.id)
    try {
      const kind = slot.slot === 'background' ? 'image' : 'model3d'
      const data = await fetchOutputs(0, 0, { mediaType: kind, workspace })
      setExplorerItems(kind === 'model3d' ? data.outputs.filter(item => /\.glb$/i.test(item.name)) : data.outputs)
    } catch {
      setExplorerItems([])
    }
  }

  const mountTemplate = (id: Scene3DTemplateId) => {
    for (const slot of sceneDoc.slots) revokeIfBlob(slot.sourceUrl)
    setSceneDoc(applyScene3DTemplate(id))
    setCatalogs({})
    setFrame(0)
    setSelectedId(applyScene3DTemplate(id).slots[0]?.id ?? 'subject_1')
  }

  const hitSlot = (clientX: number, clientY: number, host: HTMLDivElement) => {
    const bounds = host.getBoundingClientRect()
    const nx = (clientX - bounds.left) / Math.max(1, bounds.width)
    const ny = (clientY - bounds.top) / Math.max(1, bounds.height)
    const eye = cameraEyeAtTime(sceneDoc.camera, seconds, sceneDoc.duration, sceneDoc.slots)
    let best: { id: string; dist: number } | null = null
    for (const slot of sceneDoc.slots) {
      if (slot.slot === 'background') continue
      const projected = projectPoint(slot.position, eye, sceneDoc.camera.look, sceneDoc.camera.fov, bounds.width / Math.max(1, bounds.height))
      if (!projected) continue
      const dist = Math.hypot(projected.x - nx, projected.y - ny)
      if (dist < 0.08 && (!best || dist < best.dist)) best = { id: slot.id, dist }
    }
    return best?.id ?? null
  }

  const roundtrip = Boolean(parseScene3DDocument(JSON.parse(JSON.stringify(sceneDoc))))

  const exportScene = async () => {
    const stage = stageRef.current
    if (!stage || exporting || playing) return
    setExporting(true)
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
      setExporting(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid="scene3d-workspace">
      <div className="flex flex-wrap gap-1">
        {SCENE3D_TEMPLATES.map(template => (
          <button
            key={template.id}
            type="button"
            onClick={() => mountTemplate(template.id)}
            className={`rounded border px-1.5 py-1 text-[9px] ${sceneDoc.templateId === template.id ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100' : 'border-border text-text-muted'}`}
          >
            {t(`stage.template.${template.id}`)}
          </button>
        ))}
      </div>
      <div
        className="relative w-full overflow-hidden rounded-lg border border-border bg-[#10141c]"
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={event => {
          const id = hitSlot(event.clientX, event.clientY, event.currentTarget)
          if (!id) return
          const slot = sceneDoc.slots.find(item => item.id === id)
          if (!slot) return
          setSelectedId(id)
          dragRef.current = { id, startX: slot.position[0], startZ: slot.position[2], pointerX: event.clientX, pointerY: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const drag = dragRef.current
          if (!drag) return
          const dx = (event.clientX - drag.pointerX) * 0.008
          const dz = (event.clientY - drag.pointerY) * 0.008
          setSceneDoc(current => patchScene3DSlot(current, drag.id, {
            position: [drag.startX + dx, current.slots.find(slot => slot.id === drag.id)?.position[1] ?? 0, drag.startZ + dz],
          }))
        }}
        onPointerUp={() => { dragRef.current = null }}
      >
        <Scene3DStage
          ref={stageRef}
          document={sceneDoc}
          sceneSeconds={seconds}
          onSlotClips={(slotId, clips) => setCatalogs(current => ({ ...current, [slotId]: clips }))}
        />
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-1 text-[8px] text-cyan-200">
          {t('stage.badge')} · {t(`stage.template.${sceneDoc.templateId}`)} · {sceneDoc.camera.family} · {seconds.toFixed(2)}s
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
        {FAMILIES.map(family => (
          <button
            key={family}
            type="button"
            onClick={() => setSceneDoc(current => ({ ...current, camera: { ...current.camera, family } }))}
            className={`rounded border px-1.5 py-1 ${sceneDoc.camera.family === family ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100' : 'border-border text-text-muted'}`}
          >
            {t(`stage.family.${family}`)}
          </button>
        ))}
        <button type="button" onClick={() => setPlaying(current => !current)} className="rounded border border-border bg-bg-primary px-2 py-1">
          {playing ? t('stage.pause') : t('stage.play')}
        </button>
        <button
          type="button"
          data-testid="world3d-export"
          disabled={exporting || playing}
          onClick={() => void exportScene()}
          className="rounded border border-cyan-400/50 bg-cyan-400/10 px-2 py-1 text-cyan-100 disabled:opacity-40"
        >
          {exporting ? t('stage.exporting') : t('stage.export')}
        </button>
        <span className="text-text-muted">{t('stage.eye', { x: cameraEyeAtTime(sceneDoc.camera, seconds, sceneDoc.duration, sceneDoc.slots)[0].toFixed(2) })}</span>
      </div>
      {selected && (
        <div className="flex flex-wrap gap-2 rounded border border-border bg-bg-primary p-1.5" data-testid="scene3d-transforms">
          <span className="text-[9px] font-medium text-text-primary">{t(`stage.slot.${selected.slot}`)}</span>
          {numberField('X', selected.position[0], value => setSceneDoc(current => patchScene3DSlot(current, selected.id, { position: [value, selected.position[1], selected.position[2]] })))}
          {numberField('Y', selected.position[1], value => setSceneDoc(current => patchScene3DSlot(current, selected.id, { position: [selected.position[0], value, selected.position[2]] })))}
          {numberField('Z', selected.position[2], value => setSceneDoc(current => patchScene3DSlot(current, selected.id, { position: [selected.position[0], selected.position[1], value] })))}
          {numberField(t('stage.scale'), selected.scale, value => setSceneDoc(current => patchScene3DSlot(current, selected.id, { scale: Math.max(0.05, value) })))}
          {numberField(t('stage.rotate'), selected.rotationY, value => setSceneDoc(current => patchScene3DSlot(current, selected.id, { rotationY: value })), 0.05)}
        </div>
      )}
      <div className="grid gap-1.5 md:grid-cols-2">
        {sceneDoc.slots.map(slot => {
          const clips = catalogs[slot.id] ?? []
          return (
            <div key={slot.id} className={`rounded border p-1.5 text-[9px] text-text-secondary ${selectedId === slot.id ? 'border-cyan-300 bg-cyan-400/5' : 'border-border bg-bg-primary'}`}>
              <button type="button" className="block font-medium text-text-primary" onClick={() => setSelectedId(slot.id)}>{t(`stage.slot.${slot.slot}`)}</button>
              <button type="button" onClick={() => void openExplorer(slot)} className="mt-1 w-full rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-1 text-[9px] text-cyan-100">
                {t('stage.fromApp')}
              </button>
              <input
                type="file"
                accept={slot.slot === 'background' ? 'image/*' : '.glb,model/gltf-binary'}
                className="mt-1 w-full text-[8px]"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  revokeIfBlob(slot.sourceUrl)
                  assignSource(slot.id, URL.createObjectURL(file), slot.slot === 'background' ? 'image' : 'model3d')
                }}
              />
              {clips.length > 0 && (
                <select
                  className="mt-1 w-full rounded border border-border bg-bg-tertiary px-1 py-0.5"
                  value={slot.clip ? `${slot.clip.index}\u001f${slot.clip.name}` : ''}
                  onChange={event => {
                    const value = event.target.value
                    const split = value.indexOf('\u001f')
                    setSceneDoc(current => patchScene3DSlot(current, slot.id, {
                      clip: value ? { index: Number(value.slice(0, split)) || 0, name: value.slice(split + 1) } : null,
                    }))
                  }}
                >
                  <option value="">{t('stage.noClip')}</option>
                  {clips.map(clip => (
                    <option key={`${clip.index}:${clip.name}`} value={`${clip.index}\u001f${clip.name}`}>
                      {clip.index}: {clip.name}
                    </option>
                  ))}
                </select>
              )}
              {slot.slot === 'background' && (
                <InfiniteBackdropControls
                  loop={slot.loop}
                  infiniteLabel={t('stage.infinite')}
                  speedLabel={t('stage.loopSpeed')}
                  onChange={loop => setSceneDoc(current => patchScene3DSlot(current, slot.id, {
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
      {clipIssue && <p className="text-[8px] text-red-300">{clipIssue}</p>}
      {exportNote && <p className="text-[8px] text-cyan-100" data-testid="world3d-export-note">{exportNote}</p>}
      <p className="text-[8px] text-text-muted">{sceneDoc.templateId === 'run-loop' ? t('stage.runHelp') : t('stage.help')}</p>
      <span data-testid="scene3d-roundtrip" className="hidden">{roundtrip ? 'ok' : 'bad'}</span>
      <AssetExplorerDialog
        open={Boolean(explorerSlot)}
        title={t('stage.fromApp')}
        items={explorerItems}
        onClose={() => setExplorerSlot(null)}
        onChoose={item => {
          if (item && explorerSlot) assignSource(explorerSlot, item.url, item.type === 'image' ? 'image' : 'model3d')
          setExplorerSlot(null)
        }}
      />
    </div>
  )
}

function InfiniteBackdropControls({
  loop,
  infiniteLabel,
  speedLabel,
  onChange,
}: {
  loop: Scene3DLoop | undefined
  infiniteLabel: string
  speedLabel: string
  onChange: (loop: Scene3DLoop) => void
}) {
  const speed = loop?.speed ?? 0.18
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <label className="flex items-center gap-1 text-[8px] text-text-muted">
        <input
          type="checkbox"
          data-testid="scene3d-infinite"
          checked={loop?.cylinder === true}
          onChange={event => onChange({ cylinder: event.target.checked, speed })}
        />
        {infiniteLabel}
      </label>
      {loop?.cylinder === true && numberField(speedLabel, speed, value => onChange({ cylinder: true, speed: value }), 0.01)}
    </div>
  )
}
