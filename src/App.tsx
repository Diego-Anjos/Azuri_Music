import { useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { LyricsView } from './components/LyricsView'
import { VideoStageView } from './components/VideoStageView'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Album } from './pages/Album'
import { Artist } from './pages/Artist'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'
import { Library } from './pages/Library'
import { Playlist } from './pages/Playlist'
import { Profile } from './pages/Profile'
import { Pulse } from './pages/Pulse'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { StudioUpload } from './pages/StudioUpload'
import { VideoEmbed } from './pages/VideoEmbed'
import { usePlayerStore } from './store/usePlayerStore'

/** Overlay de letras no nível raiz — fixed top-0 sem herdar overflow/transform. */
function LyricsOverlay() {
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen)
  const isVideoMode = usePlayerStore((s) => s.isVideoMode)
  const videoDisplayMode = usePlayerStore((s) => s.videoDisplayMode)
  if (!isLyricsOpen) return null
  if (isVideoMode && videoDisplayMode === 'split-lyrics') return null
  return <LyricsView />
}

/** Em mudança de rota com palco ativo → PiP flutuante. */
function VideoModeRouteSync() {
  const location = useLocation()
  const isVideoMode = usePlayerStore((s) => s.isVideoMode)
  const videoDisplayMode = usePlayerStore((s) => s.videoDisplayMode)
  const setVideoDisplayMode = usePlayerStore((s) => s.setVideoDisplayMode)

  useEffect(() => {
    if (isVideoMode && videoDisplayMode === 'stage') {
      setVideoDisplayMode('pip')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a mudança de rota
  }, [location.pathname])

  return null
}

/** Tela de boot glassmorphism — aguarda account.get(). */
function AuthBootScreen() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0F19] text-[#94A3B8]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.12),_transparent_55%)]" />
      <div className="relative flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#111827]/70 px-10 py-12 shadow-2xl backdrop-blur-xl">
        <img
          src="/logo.png"
          alt="Azuri Music"
          className="h-14 w-14 animate-pulse object-contain drop-shadow-[0_0_16px_rgba(0,229,255,0.5)]"
        />
        <p className="text-sm font-medium tracking-wide text-[#F8FAFC]/90">
          Azuri Music
        </p>
        <p className="text-xs text-[#94A3B8]">Sincronizando Núcleo Azuri…</p>
      </div>
    </div>
  )
}

/** Landing livre; se já autenticado → /home. */
function PublicLanding() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/home" replace />
  return <Landing />
}

/** Rotas internas: sem sessão → / com AuthModal (login). */
function RequireAuth() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return (
      <Navigate to="/" replace state={{ openAuth: 'login' as const }} />
    )
  }
  return <Outlet />
}

function AuthenticatedOverlays() {
  const { isAuthenticated, isLoadingAuth } = useAuth()
  if (isLoadingAuth || !isAuthenticated) return null
  return (
    <>
      <VideoModeRouteSync />
      <LyricsOverlay />
      <VideoStageView />
    </>
  )
}

function AppRoutes() {
  const { isLoadingAuth } = useAuth()

  if (isLoadingAuth) {
    return <AuthBootScreen />
  }

  return (
    <Routes>
      <Route path="/" element={<PublicLanding />} />
      <Route path="/welcome" element={<PublicLanding />} />
      {/* Same-origin bridge para YouTube embed (Document PiP / Erro 153) */}
      <Route path="/video-embed" element={<VideoEmbed />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/studio/upload" element={<StudioUpload />} />
          <Route
            path="/upload"
            element={<Navigate to="/studio/upload" replace />}
          />
          <Route path="/playlist/:id" element={<Playlist />} />
          <Route path="/artist/:id" element={<Artist />} />
          <Route path="/album/:id" element={<Album />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <AuthenticatedOverlays />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
