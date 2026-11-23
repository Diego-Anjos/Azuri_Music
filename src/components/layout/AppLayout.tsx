import { Outlet } from 'react-router-dom'
import { MusicPlayer } from './MusicPlayer'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#0B0F19]">
      <div className="flex min-h-0 flex-1 pb-24">
        <Sidebar />
        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
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
