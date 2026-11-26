import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MainContent } from '../components/layout/MainContent'
import { RightSidebar } from '../components/layout/RightSidebar'
import {
  getPlaylists,
  getRecentPlays,
  subscribeLibraryUpdates,
  type RecentPlayItem,
  type UserPlaylist,
} from '../services/libraryStorage'
import {
  clearHomeRecommendationsCache,
  getPersonalizedHomeData,
  type BecauseYouListened,
  type FeaturedRelease,
  type PersonalizedMix,
  type SuggestedArtist,
} from '../services/recommendationService'
import { isSpotifyInCooldown, type SpotifyTrack } from '../services/spotify'
import {
  PROFILE_UPDATED_EVENT,
  getUserProfile,
  subscribeProfileUpdates,
} from '../services/userProfileService'

function formatProfileHandle(handle?: string): string {
  if (!handle) return '@usuario'
  return handle.startsWith('@') ? handle : `@${handle}`
}

export function Home() {
  const [libraryPlaylists, setLibraryPlaylists] = useState<UserPlaylist[]>(() =>
    getPlaylists(),
  )
  const [recentPlays, setRecentPlays] = useState<RecentPlayItem[]>(() =>
    getRecentPlays(12),
  )
  const [featuredRelease, setFeaturedRelease] =
    useState<FeaturedRelease | null>(null)
  const [personalizedMixes, setPersonalizedMixes] = useState<PersonalizedMix[]>(
    [],
  )
  const [becauseYouListened, setBecauseYouListened] =
    useState<BecauseYouListened | null>(null)
  const [suggestedArtists, setSuggestedArtists] = useState<SuggestedArtist[]>(
    [],
  )
  const [newTracks, setNewTracks] = useState<SpotifyTrack[]>([])
  const [genresKey, setGenresKey] = useState(() =>
    getUserProfile().favoriteGenres.join('|'),
  )
  const [formattedHandle, setFormattedHandle] = useState(() =>
    formatProfileHandle(getUserProfile().handle),
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    return subscribeLibraryUpdates(() => {
      setLibraryPlaylists(getPlaylists())
      setRecentPlays(getRecentPlays(12))
    })
  }, [])

  useEffect(() => {
    const syncProfile = () => {
      const profile = getUserProfile()
      setFormattedHandle(formatProfileHandle(profile.handle))
      const next = profile.favoriteGenres.join('|')
      setGenresKey((prev) => {
        if (prev !== next) {
          clearHomeRecommendationsCache()
        }
        return next
      })
    }

    syncProfile()
    window.addEventListener(PROFILE_UPDATED_EVENT, syncProfile)
    const unsubscribe = subscribeProfileUpdates(syncProfile)
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, syncProfile)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const spotifyBlocked = isSpotifyInCooldown()

        if (reloadToken > 0) {
          setIsRefreshing(true)
          // Em cooldown, não limpa cache nem força novas buscas Spotify
          if (!spotifyBlocked) {
            clearHomeRecommendationsCache()
          }
        } else {
          setIsLoading(true)
        }
        setError(null)

        const data = await getPersonalizedHomeData({
          forceRefresh: reloadToken > 0 && !spotifyBlocked,
        })

        if (cancelled) return

        setFeaturedRelease(data.featuredRelease)
        setPersonalizedMixes(data.personalizedMixes)
        setBecauseYouListened(data.becauseYouListened)
        setSuggestedArtists(data.suggestedArtists)
        setNewTracks(data.newTracks)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Erro ao carregar recomendações',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [genresKey, reloadToken])

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <MainContent
        libraryPlaylists={libraryPlaylists}
        recentPlays={recentPlays}
        featuredRelease={featuredRelease}
        personalizedMixes={personalizedMixes}
        becauseYouListened={becauseYouListened}
        suggestedArtists={suggestedArtists}
        newTracks={newTracks}
        isLoading={isLoading}
        error={error}
        userHandle={formattedHandle}
        refreshControl={
          <button
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={isLoading || isRefreshing}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#94A3B8] transition-colors hover:border-cyan-400/30 hover:text-cyan-300 disabled:opacity-50"
            aria-label="Atualizar recomendações"
          >
            <RefreshCw
              className={`size-3 ${isRefreshing ? 'animate-spin' : ''}`}
              strokeWidth={1.5}
            />
            Atualizar
          </button>
        }
      />
      <RightSidebar
        variant="rail"
        artists={suggestedArtists}
        newTracks={newTracks.slice(0, 6)}
      />
    </div>
  )
}
