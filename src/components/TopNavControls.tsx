import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Library,
  LogOut,
  Pencil,
  Settings,
  UploadCloud,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getUserProfile,
  subscribeProfileUpdates,
  type UserProfile,
} from '../services/userProfileService'

const ICON_STROKE = 1.5

function canGoBackInTab(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  if (typeof idx === 'number') return idx > 0
  return window.history.length > 1
}

export function TopNavControls() {
  const navigate = useNavigate()
  const { profile: authProfile, logout } = useAuth()
  const menuRef = useRef<HTMLDivElement>(null)
  const [profile, setProfile] = useState<UserProfile>(
    () => authProfile ?? getUserProfile(),
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    setProfile(authProfile)
  }, [authProfile])

  useEffect(() => {
    return subscribeProfileUpdates(() => {
      setProfile(getUserProfile())
    })
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  function handleBack() {
    if (canGoBackInTab()) {
      navigate(-1)
      return
    }
    navigate('/home')
  }

  function handleForward() {
    navigate(1)
  }

  function goTo(path: string) {
    setMenuOpen(false)
    navigate(path)
  }

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setMenuOpen(false)
    try {
      await logout()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-[#0B0F19]/80 px-4 py-3 backdrop-blur-md md:px-8">
      <div className="hidden items-center gap-2 sm:flex">
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
      </div>

      <div className="sm:hidden" aria-hidden />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => navigate('/studio/upload')}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-gray-200 transition-all hover:border-cyan-400/50 hover:bg-cyan-500/15 hover:text-cyan-400"
        >
          <UploadCloud className="h-4 w-4" strokeWidth={ICON_STROKE} />
          <span className="hidden sm:inline">Upload</span>
        </button>

        <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex cursor-pointer items-center gap-2.5 rounded-full border border-white/10 bg-white/5 py-1 pl-1.5 pr-3.5 transition-all hover:border-cyan-400/50 hover:bg-white/10"
        >
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-7 w-7 rounded-full object-cover ring-1 ring-cyan-400/60"
          />
          <span className="hidden text-sm font-medium text-white sm:block">
            {profile.name}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-[#94A3B8] transition-transform ${
              menuOpen ? 'rotate-180' : ''
            }`}
            strokeWidth={ICON_STROKE}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-white/10 bg-[#111827]/95 py-1.5 shadow-2xl backdrop-blur-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => goTo('/profile')}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#F8FAFC] transition-colors hover:bg-white/5 hover:text-cyan-300"
            >
              <UserRound className="h-4 w-4" strokeWidth={ICON_STROKE} />
              Meu Perfil
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => goTo('/pulse')}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#F8FAFC] transition-colors hover:bg-white/5 hover:text-cyan-300"
            >
              <Activity
                className="h-4 w-4 text-[#22d3ee]"
                strokeWidth={ICON_STROKE}
              />
              <span className="flex-1">Meu Pulso</span>
              <span className="rounded-md border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-cyan-300">
                STATS
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => goTo('/profile?edit=true')}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#F8FAFC] transition-colors hover:bg-white/5 hover:text-cyan-300"
            >
              <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} />
              Editar Perfil
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => goTo('/library')}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#F8FAFC] transition-colors hover:bg-white/5 hover:text-cyan-300"
            >
              <Library className="h-4 w-4" strokeWidth={ICON_STROKE} />
              Sua Biblioteca
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => goTo('/settings')}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#F8FAFC] transition-colors hover:bg-white/5 hover:text-cyan-300"
            >
              <Settings className="h-4 w-4" strokeWidth={ICON_STROKE} />
              Configurações
            </button>

            <div className="my-1.5 border-t border-white/10" />
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-400/90 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" strokeWidth={ICON_STROKE} />
              {signingOut ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        )}
        </div>
      </div>
    </header>
  )
}
