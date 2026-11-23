import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type AzuriToastProps = {
  message: string | null
  onClose: () => void
  durationMs?: number
}

export function AzuriToast({
  message,
  onClose,
  durationMs = 2200,
}: AzuriToastProps) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onClose, durationMs)
    return () => clearTimeout(timer)
  }, [message, onClose, durationMs])

  if (!message || typeof document === 'undefined') return null

  return createPortal(
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-[70] -translate-x-1/2 px-4">
      <div className="rounded-full border border-cyan-400/30 bg-[#0F172A]/95 px-4 py-2 text-sm font-medium text-cyan-300 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl">
        {message}
      </div>
    </div>,
    document.body,
  )
}
