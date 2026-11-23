import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const ICON_STROKE = 1.5

function canGoBackInTab(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  if (typeof idx === 'number') return idx > 0
  return window.history.length > 1
}

export function TopNavControls() {
  const navigate = useNavigate()

  function handleBack() {
    if (canGoBackInTab()) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  function handleForward() {
    navigate(1)
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-[#0B0F19]/80 px-6 py-4 backdrop-blur-md md:px-10">
      <button
        type="button"
        title="Voltar"
        aria-label="Voltar"
        onClick={handleBack}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/60 text-white shadow-lg backdrop-blur-md transition-all hover:border-cyan-400/50 hover:bg-black/85 hover:text-cyan-400"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={ICON_STROKE} />
      </button>

      <button
        type="button"
        title="Avançar"
        aria-label="Avançar"
        onClick={handleForward}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/5 bg-black/40 text-gray-300 backdrop-blur-md transition-all hover:bg-black/70 hover:text-white"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={ICON_STROKE} />
      </button>
    </header>
  )
}
