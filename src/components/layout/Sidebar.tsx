import { useState } from 'react'
import { Home, Library, Plus, Search } from 'lucide-react'

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'library', label: 'Library', icon: Library },
] as const

const ICON_STROKE = 1.5

export function Sidebar() {
  const [activeId, setActiveId] = useState<(typeof navItems)[number]['id']>(
    'search',
  )

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col bg-[#0B0F19] px-4 py-6 md:flex">
      <h1 className="mb-8 px-2 text-2xl font-bold tracking-tight text-[#00E5FF]">
        Azuri Music
      </h1>

      <nav className="flex flex-col gap-2">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeId === id

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveId(id)}
              className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? 'bg-[#00E5FF] text-black'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Icon
                className="size-5 shrink-0"
                strokeWidth={ICON_STROKE}
              />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <button
        type="button"
        className="mt-6 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[#94A3B8] transition-colors duration-200 hover:text-[#F8FAFC]"
      >
        <Plus className="size-5 shrink-0" strokeWidth={ICON_STROKE} />
        <span>Criar playlist</span>
      </button>
    </aside>
  )
}
