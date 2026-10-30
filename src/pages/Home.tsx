import { useEffect, useState } from 'react'
import { MainContent } from '../components/layout/MainContent'
import { RightSidebar } from '../components/layout/RightSidebar'
import {
  searchPlaylistsByQuery,
  type SpotifyPlaylist,
} from '../services/spotify'

export function Home() {
  const [recentPlaylists, setRecentPlaylists] = useState<SpotifyPlaylist[]>([])
  const [mixPlaylists, setMixPlaylists] = useState<SpotifyPlaylist[]>([])
  const [electronicPlaylists, setElectronicPlaylists] = useState<
    SpotifyPlaylist[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadHomePlaylists() {
      try {
        setIsLoading(true)
        setError(null)

        const [recent, mix, electronic] = await Promise.all([
          searchPlaylistsByQuery('Hip-Rock OR Nu Metal', 6),
          searchPlaylistsByQuery('Vocaloid OR Hatsune Miku', 5),
          searchPlaylistsByQuery('Electronic OR Synthwave', 5),
        ])

        if (cancelled) return

        setRecentPlaylists(recent)
        setMixPlaylists(mix)
        setElectronicPlaylists(electronic)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Erro ao carregar playlists',
          )
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadHomePlaylists()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <MainContent
        recentPlaylists={recentPlaylists}
        mixPlaylists={mixPlaylists}
        electronicPlaylists={electronicPlaylists}
        isLoading={isLoading}
        error={error}
      />
      <RightSidebar />
    </div>
  )
}
