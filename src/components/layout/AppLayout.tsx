import { Outlet } from 'react-router-dom'
import { LyricsView } from '../LyricsView'
import { TopNavControls } from '../TopNavControls'
import { usePlayerStore } from '../../store/usePlayerStore'
import { MusicPlayer } from './MusicPlayer'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen)

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#0B0F19]">
      <div className="flex min-h-0 flex-1 pb-24">
        <Sidebar />
        <main className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {!isLyricsOpen && <TopNavControls />}
          <Outlet />
          {isLyricsOpen && <LyricsView />}
        </main>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
        <div className="pointer-events-auto">
          <MusicPlayer />
        </div>
      </div>
    </div>
  )
}
