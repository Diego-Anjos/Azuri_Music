import { useEffect, useState } from 'react'
import { PlaylistCard } from '../PlaylistCard'
import { getFeaturedPlaylists, type Playlist } from '../../services/api'

export function MainContent() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadPlaylists() {
      try {
        setIsLoading(true)
        const data = await getFeaturedPlaylists()
        if (!cancelled) setPlaylists(data)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadPlaylists()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#1E293B] to-[#0B0F19]">
      <header className="px-4 pb-2 pt-6 md:px-8">
        <h2 className="text-3xl font-bold text-[#F8FAFC]">Boa tarde</h2>
      </header>

      <section className="px-4 py-6 md:px-8">
        <h3 className="mb-4 text-xl font-semibold text-[#F8FAFC]">
          Playlists para você
        </h3>

        {isLoading ? (
          <p className="text-sm text-[#94A3B8]">Carregando playlists...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                title={playlist.title}
                description={playlist.description}
                coverUrl={playlist.coverUrl}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
