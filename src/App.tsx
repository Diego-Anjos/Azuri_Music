import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LyricsView } from './components/LyricsView'
import { AppLayout } from './components/layout/AppLayout'
import { Album } from './pages/Album'
import { Artist } from './pages/Artist'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'
import { Library } from './pages/Library'
import { Playlist } from './pages/Playlist'
import { Profile } from './pages/Profile'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { StudioUpload } from './pages/StudioUpload'
import { isUserAuthenticated } from './services/userProfileService'
import { usePlayerStore } from './store/usePlayerStore'

/** Overlay de letras no nível raiz — fixed top-0 sem herdar overflow/transform. */
function LyricsOverlay() {
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen)
  if (!isLyricsOpen) return null
  return <LyricsView />
}

/** Landing em tela cheia (sem sidebar/player) enquanto deslogado. */
function PublicLanding() {
  if (isUserAuthenticated()) {
    return <Navigate to="/home" replace />
  }
  return <Landing />
}

/** App completo só com sessão mock autenticada. */
function ProtectedAppLayout() {
  if (!isUserAuthenticated()) {
    return <Navigate to="/" replace />
  }
  return <AppLayout />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLanding />} />
        <Route path="/welcome" element={<PublicLanding />} />

        <Route element={<ProtectedAppLayout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/studio/upload" element={<StudioUpload />} />
          <Route path="/playlist/:id" element={<Playlist />} />
          <Route path="/artist/:id" element={<Artist />} />
          <Route path="/album/:id" element={<Album />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
      <LyricsOverlay />
    </BrowserRouter>
  )
}

export default App
