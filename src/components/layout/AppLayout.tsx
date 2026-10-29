import { MainContent } from './MainContent'
import { MusicPlayer } from './MusicPlayer'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B0F19]">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <MainContent />
      </div>
      <MusicPlayer />
    </div>
  )
}
