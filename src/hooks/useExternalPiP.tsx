import { useCallback, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ExternalMiniPlayer } from '../components/ExternalMiniPlayer'
import { usePlayerStore } from '../store/usePlayerStore'

type ExternalPiPState = {
  isOpen: boolean
  isSupported: boolean
  mode: 'document' | 'canvas' | null
}

type Listener = (state: ExternalPiPState) => void

const listeners = new Set<Listener>()

let sharedState: ExternalPiPState = {
  isOpen: false,
  isSupported:
    typeof window !== 'undefined' &&
    (!!window.documentPictureInPicture ||
      (typeof HTMLVideoElement !== 'undefined' &&
        'requestPictureInPicture' in HTMLVideoElement.prototype)),
  mode: null,
}

let pipWindow: Window | null = null
let pipRoot: Root | null = null
let fallbackVideo: HTMLVideoElement | null = null
let fallbackCanvas: HTMLCanvasElement | null = null
let fallbackRaf = 0
let coverImage: HTMLImageElement | null = null

function emit(next: Partial<ExternalPiPState>) {
  sharedState = { ...sharedState, ...next }
  for (const listener of listeners) listener(sharedState)
}

function copyStylesToPiP(targetDoc: Document) {
  const base = targetDoc.createElement('base')
  base.href = document.baseURI
  targetDoc.head.appendChild(base)

  for (const node of document.head.querySelectorAll(
    'style, link[rel="stylesheet"]',
  )) {
    targetDoc.head.appendChild(node.cloneNode(true))
  }

  // Folhas construídas via CSSOM (Tailwind/Vite) — copia regras quando possível
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n')
      if (!rules) continue
      const style = targetDoc.createElement('style')
      style.textContent = rules
      targetDoc.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = targetDoc.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        targetDoc.head.appendChild(link)
      }
    }
  }

  targetDoc.documentElement.className = document.documentElement.className
  targetDoc.body.className =
    'm-0 h-full overflow-hidden bg-[#0B0F19] text-[#F8FAFC] antialiased'
  targetDoc.documentElement.style.height = '100%'
  targetDoc.body.style.height = '100%'
  targetDoc.body.style.margin = '0'
}

function teardownDocumentPiP() {
  if (pipRoot) {
    try {
      pipRoot.unmount()
    } catch {
      // ignore
    }
    pipRoot = null
  }
  if (pipWindow && !pipWindow.closed) {
    try {
      pipWindow.close()
    } catch {
      // ignore
    }
  }
  pipWindow = null
}

function stopCanvasFallback() {
  if (fallbackRaf) {
    cancelAnimationFrame(fallbackRaf)
    fallbackRaf = 0
  }
  if (fallbackVideo) {
    try {
      if (document.pictureInPictureElement === fallbackVideo) {
        void document.exitPictureInPicture()
      }
    } catch {
      // ignore
    }
    fallbackVideo.remove()
    fallbackVideo = null
  }
  if (fallbackCanvas) {
    fallbackCanvas.remove()
    fallbackCanvas = null
  }
  coverImage = null
}

function drawFallbackFrame() {
  const canvas = fallbackCanvas
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  const { currentTrack, progress, duration, isPlaying } =
    usePlayerStore.getState()
  const title = currentTrack?.name ?? 'Azuri Music'
  const artist =
    currentTrack?.artists?.map((a) => a.name).join(', ') ?? ''
  const coverUrl = currentTrack?.album?.images?.[0]?.url

  if (coverUrl && coverImage?.src !== coverUrl) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = coverUrl
    coverImage = img
  }

  const w = canvas.width
  const h = canvas.height

  ctx.fillStyle = '#0B0F19'
  ctx.fillRect(0, 0, w, h)

  // Glow
  const gradient = ctx.createRadialGradient(
    w * 0.3,
    h * 0.4,
    10,
    w * 0.5,
    h * 0.5,
    w * 0.7,
  )
  gradient.addColorStop(0, 'rgba(0, 229, 255, 0.18)')
  gradient.addColorStop(1, 'rgba(11, 15, 25, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  const artSize = Math.min(h * 0.55, 120)
  const artX = 24
  const artY = (h - artSize) / 2 - 8

  if (coverImage?.complete && coverImage.naturalWidth > 0) {
    ctx.save()
    roundRect(ctx, artX, artY, artSize, artSize, 12)
    ctx.clip()
    ctx.drawImage(coverImage, artX, artY, artSize, artSize)
    ctx.restore()
  } else {
    ctx.fillStyle = '#111827'
    roundRect(ctx, artX, artY, artSize, artSize, 12)
    ctx.fill()
  }

  const textX = artX + artSize + 20
  ctx.fillStyle = '#F8FAFC'
  ctx.font = '600 18px system-ui, sans-serif'
  ctx.fillText(truncateCanvasText(ctx, title, w - textX - 24), textX, artY + 28)
  ctx.fillStyle = '#94A3B8'
  ctx.font = '400 14px system-ui, sans-serif'
  ctx.fillText(truncateCanvasText(ctx, artist, w - textX - 24), textX, artY + 52)

  // Progress bar
  const barY = h - 36
  const barX = 24
  const barW = w - 48
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  roundRect(ctx, barX, barY, barW, 6, 3)
  ctx.fill()
  ctx.fillStyle = '#00E5FF'
  roundRect(ctx, barX, barY, Math.max(2, barW * progress), 6, 3)
  ctx.fill()

  ctx.fillStyle = '#94A3B8'
  ctx.font = '11px ui-monospace, monospace'
  const elapsed = duration > 0 ? progress * duration : 0
  ctx.fillText(formatClock(elapsed), barX, barY - 8)
  const endLabel = formatClock(duration)
  const endW = ctx.measureText(endLabel).width
  ctx.fillText(endLabel, barX + barW - endW, barY - 8)

  ctx.fillStyle = isPlaying ? '#00E5FF' : '#94A3B8'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(isPlaying ? '▶ A tocar' : '❚❚ Pausado', textX, artY + 78)

  fallbackRaf = requestAnimationFrame(drawFallbackFrame)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let value = text
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1)
  }
  return `${value}…`
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function openDocumentPiP(): Promise<boolean> {
  const api = window.documentPictureInPicture
  if (!api) return false

  const isVideoMode = usePlayerStore.getState().isVideoMode
  const width = isVideoMode ? 420 : 350
  const height = isVideoMode ? 280 : 470

  const win = await api.requestWindow({ width, height })
  pipWindow = win
  copyStylesToPiP(win.document)
  // about:blank não tem origin HTTP — propaga a origin do app para iframes /video-embed
  win.document.documentElement.dataset.azuriOrigin = window.location.origin

  const mount = win.document.createElement('div')
  mount.id = 'azuri-external-pip-root'
  mount.style.height = '100%'
  mount.style.width = '100%'
  win.document.body.appendChild(mount)

  pipRoot = createRoot(mount)
  pipRoot.render(<ExternalMiniPlayer />)

  win.addEventListener('pagehide', () => {
    teardownDocumentPiP()
    emit({ isOpen: false, mode: null })
  })

  emit({ isOpen: true, mode: 'document' })
  return true
}

async function openCanvasFallbackPiP(): Promise<boolean> {
  if (
    typeof HTMLVideoElement === 'undefined' ||
    !('requestPictureInPicture' in HTMLVideoElement.prototype)
  ) {
    return false
  }

  stopCanvasFallback()

  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  canvas.style.display = 'none'
  document.body.appendChild(canvas)
  fallbackCanvas = canvas

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.autoplay = true
  video.style.position = 'fixed'
  video.style.width = '1px'
  video.style.height = '1px'
  video.style.opacity = '0'
  video.style.pointerEvents = 'none'
  video.srcObject = canvas.captureStream(30)
  document.body.appendChild(video)
  fallbackVideo = video

  drawFallbackFrame()

  try {
    await video.play()
    await video.requestPictureInPicture()
  } catch (error) {
    console.warn('[Azuri PiP] fallback canvas falhou:', error)
    stopCanvasFallback()
    return false
  }

  video.addEventListener('leavepictureinpicture', () => {
    stopCanvasFallback()
    emit({ isOpen: false, mode: null })
  })

  emit({ isOpen: true, mode: 'canvas' })
  return true
}

export async function openExternalPiP(): Promise<boolean> {
  if (sharedState.isOpen) return true

  try {
    if (window.documentPictureInPicture) {
      const ok = await openDocumentPiP()
      if (ok) return true
    }
  } catch (error) {
    console.warn('[Azuri PiP] Document PiP indisponível, usando fallback:', error)
  }

  return openCanvasFallbackPiP()
}

export function closeExternalPiP() {
  teardownDocumentPiP()
  stopCanvasFallback()
  emit({ isOpen: false, mode: null })
}

export async function toggleExternalPiP(): Promise<boolean> {
  if (sharedState.isOpen) {
    closeExternalPiP()
    return false
  }
  return openExternalPiP()
}

export function getExternalPiPState(): ExternalPiPState {
  return sharedState
}

/** Hook partilhado — várias UIs (player bar / PiP card) sincronizam o mesmo estado. */
export function useExternalPiP() {
  const [state, setState] = useState<ExternalPiPState>(sharedState)

  useEffect(() => {
    const listener: Listener = (next) => setState(next)
    listeners.add(listener)
    setState(sharedState)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const open = useCallback(() => openExternalPiP(), [])
  const close = useCallback(() => {
    closeExternalPiP()
  }, [])
  const toggle = useCallback(() => toggleExternalPiP(), [])

  return {
    ...state,
    open,
    close,
    toggle,
  }
}
