import {
  getFollowingArtistIds,
  getLikedTracks,
} from './libraryStorage'
import {
  searchCatalog,
  searchTracksByQuery,
  type SpotifyArtist,
  type SpotifyTrack,
} from './spotify'
import { getUserProfile } from './userProfileService'

export const LISTENING_HISTORY_KEY = 'azuri_listening_history'
export const HOME_RECS_CACHE_KEY = 'azuri_home_recs_cache'
export const HOME_RECS_CACHE_TTL_MS = 5 * 60 * 1000

const HISTORY_MAX = 30

export type ListeningHistoryEntry = {
  trackId: string
  name: string
  artistId: string
  artistName: string
  albumCoverUrl: string
  playCount: number
  lastPlayedAt: number
}

export type PersonalizedMix = {
  id: string
  name: string
  description: string
  imageUrl: string
  tracks: SpotifyTrack[]
  seedLabel: string
}

export type FeaturedRelease = {
  track: SpotifyTrack
  badgeReason: string
}

export type BecauseYouListened = {
  seedArtistName: string
  tracks: SpotifyTrack[]
  similarArtists: SpotifyArtist[]
}

export type SuggestedArtist = SpotifyArtist & {
  genreTag: string
}

export type PersonalizedHomeData = {
  featuredRelease: FeaturedRelease | null
  personalizedMixes: PersonalizedMix[]
  becauseYouListened: BecauseYouListened | null
  suggestedArtists: SuggestedArtist[]
  newTracks: SpotifyTrack[]
  seedGenres: string[]
}

/** Mapeia cada gênero do cadastro para termos de busca correlatos no Spotify. */
export const GENRE_EXPANSION_MAP: Record<string, string[]> = {
  'Trap & Underground': [
    'underground trap',
    'pluggnb',
    'dark trap',
    'soundcloud rap',
  ],
  Phonk: ['phonk', 'drift phonk', 'brazilian phonk'],
  Synthwave: ['synthwave', 'retrowave', 'darksynth'],
  Hyperpop: ['hyperpop', 'glitchcore', 'digicore'],
  'Vocaloid / J-Core': ['vocaloid', 'j-core', 'anime electronic'],
  'Rock & Nu-Metal': ['nu metal', 'alternative metal', 'post-grunge'],
  'Lo-Fi Beats': ['lofi beats', 'chillhop', 'study beats'],
  'Hip-Hop / Rap': ['hip hop', 'rap', 'boom bap'],
  'Eletrônica / House': ['house music', 'deep house', 'electronic dance'],
  'R&B / Soul': ['r&b', 'neo soul', 'contemporary rnb'],
  'Indie / Alternativo': ['indie alternative', 'indie rock', 'indie pop'],
  Pop: ['pop', 'dance pop', 'synth pop'],
}

type TrackLike = {
  id: string
  name: string
  artists?: Array<{ id?: string; name?: string }>
  album?: {
    images?: Array<{ url: string }> | null
  } | null
  albumCoverUrl?: string
  artistName?: string
}

function expandGenre(genre: string): string[] {
  return GENRE_EXPANSION_MAP[genre] ?? [genre.toLowerCase()]
}

function pickSearchTerm(genre: string, offset = 0): string {
  const terms = expandGenre(genre)
  return terms[offset % terms.length] ?? genre
}

function readHistory(): ListeningHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LISTENING_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is ListeningHistoryEntry =>
          item != null &&
          typeof item === 'object' &&
          typeof (item as ListeningHistoryEntry).trackId === 'string' &&
          typeof (item as ListeningHistoryEntry).name === 'string',
      )
      .slice(0, HISTORY_MAX)
  } catch {
    return []
  }
}

function writeHistory(entries: ListeningHistoryEntry[]) {
  localStorage.setItem(
    LISTENING_HISTORY_KEY,
    JSON.stringify(entries.slice(0, HISTORY_MAX)),
  )
}

/** Registra uma reprodução no histórico local (até 30 faixas). */
export function recordTrackPlay(track: TrackLike): void {
  if (!track?.id || !track.name) return

  try {
    const artist = track.artists?.[0]
    const artistId = artist?.id?.trim() || `name:${(artist?.name ?? track.artistName ?? 'unknown').toLowerCase()}`
    const artistName =
      artist?.name?.trim() || track.artistName?.trim() || 'Artista desconhecido'
    const albumCoverUrl =
      track.albumCoverUrl ||
      track.album?.images?.[0]?.url ||
      ''

    const history = readHistory()
    const existingIndex = history.findIndex((item) => item.trackId === track.id)
    const now = Date.now()
    const isNewOrBump =
      existingIndex < 0 ||
      history[existingIndex]?.trackId !== track.id ||
      existingIndex > 0

    if (existingIndex >= 0) {
      const existing = history[existingIndex]
      history.splice(existingIndex, 1)
      history.unshift({
        ...existing,
        name: track.name,
        artistId,
        artistName,
        albumCoverUrl: albumCoverUrl || existing.albumCoverUrl,
        playCount: existing.playCount + 1,
        lastPlayedAt: now,
      })
    } else {
      history.unshift({
        trackId: track.id,
        name: track.name,
        artistId,
        artistName,
        albumCoverUrl,
        playCount: 1,
        lastPlayedAt: now,
      })
    }

    writeHistory(history)

    // Play de faixa nova (ou reordenação) invalida o cache da Home
    if (isNewOrBump) {
      clearHomeRecommendationsCache()
    }
  } catch {
    // ignore storage failures
  }
}

export function getListeningHistory(): ListeningHistoryEntry[] {
  return readHistory()
}

function getTopArtistsFromHistory(
  history: ListeningHistoryEntry[],
  limit = 5,
): Array<{ artistId: string; artistName: string; score: number }> {
  const scores = new Map<
    string,
    { artistId: string; artistName: string; score: number; lastPlayedAt: number }
  >()

  for (const entry of history) {
    const key = entry.artistId || entry.artistName.toLowerCase()
    const current = scores.get(key)
    const add = entry.playCount + (Date.now() - entry.lastPlayedAt < 7 * 86400000 ? 2 : 0)
    if (current) {
      current.score += add
      current.lastPlayedAt = Math.max(current.lastPlayedAt, entry.lastPlayedAt)
    } else {
      scores.set(key, {
        artistId: entry.artistId,
        artistName: entry.artistName,
        score: add,
        lastPlayedAt: entry.lastPlayedAt,
      })
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score || b.lastPlayedAt - a.lastPlayedAt)
    .slice(0, limit)
    .map(({ artistId, artistName, score }) => ({ artistId, artistName, score }))
}

function dedupeTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>()
  const result: SpotifyTrack[] = []
  for (const track of tracks) {
    if (!track?.id || seen.has(track.id)) continue
    seen.add(track.id)
    result.push(track)
  }
  return result
}

function dedupeArtists(artists: SpotifyArtist[]): SpotifyArtist[] {
  const seen = new Set<string>()
  const result: SpotifyArtist[] = []
  for (const artist of artists) {
    if (!artist?.id || seen.has(artist.id)) continue
    seen.add(artist.id)
    result.push(artist)
  }
  return result
}

function artistsFromTracks(tracks: SpotifyTrack[]): SpotifyArtist[] {
  const seen = new Set<string>()
  const artists: SpotifyArtist[] = []
  for (const track of tracks) {
    for (const artist of track.artists) {
      if (!artist.id || seen.has(artist.id)) continue
      seen.add(artist.id)
      artists.push({
        id: artist.id,
        name: artist.name,
        imageUrl: track.albumCoverUrl,
      })
    }
  }
  return artists
}

type HomeCachePayload = {
  savedAt: number
  genresKey: string
  data: PersonalizedHomeData
}

function genresKey(genres: string[]): string {
  return [...genres].map((g) => g.trim().toLowerCase()).sort().join('|')
}

function readHomeCache(currentGenres: string[]): PersonalizedHomeData | null {
  try {
    const raw = sessionStorage.getItem(HOME_RECS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HomeCachePayload
    if (!parsed?.data || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > HOME_RECS_CACHE_TTL_MS) return null
    if (parsed.genresKey !== genresKey(currentGenres)) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeHomeCache(genres: string[], data: PersonalizedHomeData) {
  try {
    const payload: HomeCachePayload = {
      savedAt: Date.now(),
      genresKey: genresKey(genres),
      data,
    }
    sessionStorage.setItem(HOME_RECS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export function clearHomeRecommendationsCache() {
  try {
    sessionStorage.removeItem(HOME_RECS_CACHE_KEY)
  } catch {
    // ignore
  }
}

async function searchTracksSafe(query: string, limit: number): Promise<SpotifyTrack[]> {
  try {
    return await searchTracksByQuery(query, limit)
  } catch {
    return []
  }
}

async function searchCatalogSafe(query: string) {
  try {
    return await searchCatalog(query)
  } catch {
    return { tracks: [] as SpotifyTrack[], artists: [] as SpotifyArtist[], playlists: [] }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Máximo de consultas Spotify na carga da Home — reserva cota para a pesquisa. */
const HOME_MAX_SPOTIFY_QUERIES = 4
const HOME_QUERY_GAP_MS = 120

/**
 * Gera prateleiras da Home a partir dos gêneros do perfil + histórico/curtidas.
 * No máximo 3–4 consultas Spotify (sequenciais), com cache de 5 min.
 */
export async function getPersonalizedHomeData(options?: {
  forceRefresh?: boolean
}): Promise<PersonalizedHomeData> {
  const profile = getUserProfile()
  const favoriteGenres =
    profile.favoriteGenres.length > 0
      ? profile.favoriteGenres
      : ['Synthwave', 'Trap & Underground']

  if (!options?.forceRefresh) {
    const cached = readHomeCache(favoriteGenres)
    if (cached) return cached
  }

  const history = getListeningHistory()
  const liked = getLikedTracks()
  const followingIds = new Set(getFollowingArtistIds())
  const topArtists = getTopArtistsFromHistory(history, 5)

  // Seeds também a partir de curtidas (artista da faixa curtida)
  const likedArtistBoost = new Map<string, { artistId: string; artistName: string; score: number }>()
  for (const track of liked.slice(0, 20)) {
    const artist = track.artists?.[0]
    if (!artist?.name) continue
    const key = artist.id || artist.name.toLowerCase()
    const current = likedArtistBoost.get(key)
    if (current) current.score += 1
    else
      likedArtistBoost.set(key, {
        artistId: artist.id || `name:${artist.name.toLowerCase()}`,
        artistName: artist.name,
        score: 1,
      })
  }

  const seedArtists = [...topArtists]
  for (const boost of likedArtistBoost.values()) {
    if (seedArtists.some((a) => a.artistName.toLowerCase() === boost.artistName.toLowerCase())) {
      continue
    }
    seedArtists.push(boost)
  }
  seedArtists.sort((a, b) => b.score - a.score)

  const primaryGenre = favoriteGenres[0]
  const secondaryGenre = favoriteGenres[1] ?? primaryGenre
  const lastListenedArtist = history[0]?.artistName
  const becauseSeed = seedArtists[0]?.artistName ?? history[0]?.artistName ?? null

  const primarySearch =
    lastListenedArtist && history.length > 0
      ? `${pickSearchTerm(primaryGenre)} ${lastListenedArtist}`
      : `${pickSearchTerm(primaryGenre)} new`

  type MixSeed = { label: string; query: string; kind: 'genre' | 'artist' }

  const mixSeeds: MixSeed[] = [
    {
      label: primaryGenre,
      query: pickSearchTerm(primaryGenre),
      kind: 'genre',
    },
    {
      label: secondaryGenre,
      query: pickSearchTerm(secondaryGenre, 1),
      kind: 'genre',
    },
  ]

  if (seedArtists[0]?.artistName) {
    mixSeeds.push({
      label: seedArtists[0].artistName,
      query: seedArtists[0].artistName,
      kind: 'artist',
    })
  }

  // Até 4 consultas totais: 1 catalog featured + até 2 mixes tracks + 1 because/catalog
  const featuredCatalog = await searchCatalogSafe(primarySearch)
  await delay(HOME_QUERY_GAP_MS)

  const mixResults: Array<{ seed: MixSeed; tracks: SpotifyTrack[] }> = []
  const mixBudget = Math.min(2, HOME_MAX_SPOTIFY_QUERIES - 2)
  for (const seed of mixSeeds.slice(0, Math.max(1, mixBudget))) {
    const tracks = await searchTracksSafe(seed.query, 10)
    mixResults.push({ seed, tracks: dedupeTracks(tracks).slice(0, 10) })
    await delay(HOME_QUERY_GAP_MS)
  }

  const becauseCatalog = becauseSeed
    ? await searchCatalogSafe(becauseSeed)
    : await searchCatalogSafe(pickSearchTerm(secondaryGenre, 2))

  // Featured release — só reutiliza o 1º catalog (sem fallback HTTP extra)
  const featuredTrack =
    featuredCatalog.tracks.find((t) =>
      favoriteGenres.some((g) =>
        expandGenre(g).some((term) =>
          `${t.name} ${t.artistName}`.toLowerCase().includes(term.split(' ')[0] ?? ''),
        ),
      ),
    ) ?? featuredCatalog.tracks[0] ?? null

  const badgeReason = lastListenedArtist && history.length > 0
    ? `RECOMENDADO • BASEADO EM ${lastListenedArtist.toUpperCase()}`
    : `RECOMENDADO • BASEADO EM ${primaryGenre.toUpperCase()}`

  const featuredRelease: FeaturedRelease | null = featuredTrack
    ? { track: featuredTrack, badgeReason }
    : null

  // Personalized mixes (derivados das poucas buscas)
  const personalizedMixes: PersonalizedMix[] = mixResults
    .filter((result) => result.tracks.length > 0)
    .map((result, index) => {
      const cover =
        result.tracks[0]?.albumCoverUrl ||
        'https://picsum.photos/seed/azuri-mix/300/300'
      const name =
        result.seed.kind === 'artist'
          ? `Mix • Estilo ${result.seed.label}`
          : `Mix • ${result.seed.label}`

      return {
        id: `azuri-mix-${index}-${result.seed.label.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        description:
          result.seed.kind === 'artist'
            ? `Faixas no clima de ${result.seed.label}`
            : `Seleção dinâmica de ${result.seed.label}`,
        imageUrl: cover,
        tracks: result.tracks,
        seedLabel: result.seed.label,
      }
    })
    .slice(0, 5)

  // Mix extra a partir do featured catalog (sem nova request)
  if (
    personalizedMixes.length < 3 &&
    featuredCatalog.tracks.length > 0
  ) {
    const leftover = dedupeTracks(featuredCatalog.tracks).slice(0, 10)
    if (leftover.length > 0) {
      personalizedMixes.push({
        id: `azuri-mix-featured-${primaryGenre.toLowerCase().replace(/\s+/g, '-')}`,
        name: `Mix • ${primaryGenre}`,
        description: `Seleção dinâmica de ${primaryGenre}`,
        imageUrl:
          leftover[0]?.albumCoverUrl ||
          'https://picsum.photos/seed/azuri-mix/300/300',
        tracks: leftover,
        seedLabel: primaryGenre,
      })
    }
  }

  // Because you listened — reutiliza becauseCatalog (sem searchTracks extra)
  let becauseYouListened: BecauseYouListened | null = null
  if (becauseSeed && (history.length > 0 || liked.length > 0)) {
    const similarFromSearch = dedupeTracks(
      becauseCatalog.tracks.filter(
        (t) => t.artistName.toLowerCase() !== becauseSeed.toLowerCase(),
      ),
    ).slice(0, 10)

    const similarArtists = dedupeArtists([
      ...becauseCatalog.artists.filter(
        (a) => a.name.toLowerCase() !== becauseSeed.toLowerCase(),
      ),
      ...artistsFromTracks(similarFromSearch),
    ]).slice(0, 8)

    if (similarFromSearch.length > 0 || similarArtists.length > 0) {
      becauseYouListened = {
        seedArtistName: becauseSeed,
        tracks: similarFromSearch.slice(0, 8),
        similarArtists,
      }
    }
  }

  // Suggested artists — derivados dos catalogs já obtidos
  const suggestedArtists: SuggestedArtist[] = []
  const seenArtistIds = new Set<string>()
  const artistPools: Array<{ genre: string; artists: SpotifyArtist[]; tracks: SpotifyTrack[] }> =
    [
      {
        genre: primaryGenre,
        artists: featuredCatalog.artists,
        tracks: featuredCatalog.tracks,
      },
      {
        genre: secondaryGenre,
        artists: becauseCatalog.artists,
        tracks: becauseCatalog.tracks,
      },
      ...mixResults.map((result) => ({
        genre: result.seed.label,
        artists: artistsFromTracks(result.tracks),
        tracks: result.tracks,
      })),
    ]

  for (const batch of artistPools) {
    for (const artist of batch.artists) {
      if (followingIds.has(artist.id) || seenArtistIds.has(artist.id)) continue
      seenArtistIds.add(artist.id)
      suggestedArtists.push({ ...artist, genreTag: batch.genre })
      if (suggestedArtists.length >= 5) break
    }
    if (suggestedArtists.length >= 5) break
  }

  if (suggestedArtists.length < 5) {
    for (const batch of artistPools) {
      for (const artist of artistsFromTracks(batch.tracks)) {
        if (followingIds.has(artist.id) || seenArtistIds.has(artist.id)) continue
        seenArtistIds.add(artist.id)
        suggestedArtists.push({ ...artist, genreTag: batch.genre })
        if (suggestedArtists.length >= 5) break
      }
      if (suggestedArtists.length >= 5) break
    }
  }

  // New tracks — reutiliza mixes + featured (sem year: queries extras)
  const newTracks = dedupeTracks([
    ...mixResults.flatMap((r) => r.tracks),
    ...featuredCatalog.tracks,
    ...becauseCatalog.tracks,
  ]).slice(0, 8)

  const data: PersonalizedHomeData = {
    featuredRelease,
    personalizedMixes,
    becauseYouListened,
    suggestedArtists: suggestedArtists.slice(0, 5),
    newTracks:
      newTracks.length > 0
        ? newTracks
        : featuredRelease
          ? [featuredRelease.track]
          : [],
    seedGenres: favoriteGenres,
  }

  writeHomeCache(favoriteGenres, data)
  return data
}
