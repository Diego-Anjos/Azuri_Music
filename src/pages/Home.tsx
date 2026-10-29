import { MainContent } from '../components/layout/MainContent'
import { RightSidebar } from '../components/layout/RightSidebar'

export function Home() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <MainContent />
      <RightSidebar />
    </div>
  )
}
