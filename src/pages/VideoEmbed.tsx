import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Página same-origin para embutir o YouTube com Referer/origin válidos.
 * Usada como fallback do Document PiP (about:blank → Erro 153).
 */
export function VideoEmbed() {
  const [params] = useSearchParams()
  const videoId = (params.get('v') ?? '').trim()
  const startSec = Math.max(0, Math.floor(Number(params.get('t') || 0) || 0))

  const embedSrc = useMemo(() => {
    if (!videoId) return ''
    const origin = encodeURIComponent(window.location.origin)
    const qs = new URLSearchParams({
      autoplay: '1',
      start: String(startSec),
      enablejsapi: '1',
      rel: '0',
      modestbranding: '1',
      origin,
    })
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${qs.toString()}`
  }, [videoId, startSec])

  if (!videoId || !embedSrc) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-sm text-slate-400">
        Vídeo não informado
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <iframe
        title="Azuri video embed"
        src={embedSrc}
        className="h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  )
}
