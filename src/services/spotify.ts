export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  imageUrl: string
}

export interface SpotifyArtist {
  id: string
  name: string
  imageUrl: string
}

export interface SpotifyTrack {
  id: string
  name: string
  artistName: string
  artists: Array<{ id: string; name: string }>
  albumCoverUrl: string
  albumName?: string
  albumReleaseDate?: string
  durationMs: number
}

export interface SpotifyRawTrack {
  id: string
  name: string
  duration_ms: number
  artists: Array<{ id?: string; name: string }>
  album: {
    name?: string
    release_date?: string
    images: Array<{ url: string }> | null
  } | null
}

export interface SpotifyPlaylistTrackItem {
  track: SpotifyRawTrack | null
}

export interface SpotifyPlaylistDetails {
  id: string
  name: string
  description: string
  imageUrl: string
  ownerName: string
  tracks: {
    total: number
    items: SpotifyPlaylistTrackItem[]
  }
}

export interface SpotifyCatalogSearchResult {
  tracks: SpotifyTrack[]
  artists: SpotifyArtist[]
  playlists: SpotifyPlaylist[]
}

interface SpotifyPlaylistApiResponse {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }> | null
  owner: { display_name: string | null } | null
  tracks?: {
    total?: number
    href?: string
    items?: Array<SpotifyPlaylistTrackItem | null>
  } | null
}

interface SpotifyPlaylistItemsApiResponse {
  total?: number
  items?: Array<{
    track?: SpotifyRawTrack | null
    // Novo formato /items pode usar "item" ou "track"
    item?: SpotifyRawTrack | null
  } | null>
}

interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface SpotifySearchPlaylistsResponse {
  playlists?: {
    items?: Array<{
      id: string
      name: string
      description: string | null
      images: Array<{ url: string }> | null
    } | null>
  } | null
}

interface SpotifyCatalogApiResponse {
  tracks?: {
    items?: Array<{
      id: string
      name: string
      duration_ms: number
      artists: Array<{ id?: string; name: string }>
      album: {
        name?: string
        release_date?: string
        images: Array<{ url: string }> | null
      } | null
    } | null>
  } | null
  artists?: {
    items?: Array<{
      id: string
      name: string
      images: Array<{ url: string }> | null
    } | null>
  } | null
  playlists?: {
    items?: Array<{
      id: string
      name: string
      description: string | null
      images: Array<{ url: string }> | null
    } | null>
  } | null
}

/** /v1/search rejeita limit fora de 1–10 neste client. */
function clampSearchLimit(limit: number): number {
  return Math.min(Math.max(1, Number(limit) || 10), 10)
}

const TOKEN_STORAGE_KEY = 'azuri_spotify_token'
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
const SEARCH_TRACKS_CACHE_PREFIX = 'azuri_sp_tracks:'
const SEARCH_CATALOG_CACHE_PREFIX = 'azuri_sp_catalog:'
const SPOTIFY_COOLDOWN_MS = 45_000

/** Token único em memória (espelhado em sessionStorage). */
let cachedAccessToken: string | null = null
let cachedExpiresAt = 0
/** Evita N tokens em paralelo quando Promise.all dispara várias buscas. */
let inFlightTokenPromise: Promise<string> | null = null
/** Circuit breaker: pausa todas as chamadas à api.spotify.com após 429. */
let spotifyCooldownUntil = 0

export function isSpotifyCoolingDown(): boolean {
  return Date.now() < spotifyCooldownUntil
}

function tripSpotifyCooldown(retryAfterHeader?: string | null) {
  let pauseMs = SPOTIFY_COOLDOWN_MS
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader)
    if (Number.isFinite(seconds) && seconds > 0) {
      pauseMs = Math.max(pauseMs, Math.round(seconds * 1000))
    }
  }
  spotifyCooldownUntil = Date.now() + pauseMs
  console.warn(
    `Spotify 429 — cooldown até ${new Date(spotifyCooldownUntil).toISOString()}`,
  )
}

function normalizeQueryKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

type PersistedToken = { accessToken: string; expiresAt: number }

function readPersistedToken(): PersistedToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedToken>
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }
    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

function persistToken(accessToken: string, expiresAt: number) {
  cachedAccessToken = accessToken
  cachedExpiresAt = expiresAt
  try {
    sessionStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ accessToken, expiresAt } satisfies PersistedToken),
    )
  } catch {
    // ignore quota / private mode
  }
}

type TimedCachePayload<T> = { savedAt: number; data: T }

function readTimedCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TimedCachePayload<T>
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > ttlMs) {
      sessionStorage.removeItem(key)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

function writeTimedCache<T>(key: string, data: T) {
  try {
    const payload: TimedCachePayload<T> = { savedAt: Date.now(), data }
    sessionStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

/**
 * Fetch para api.spotify.com com circuit breaker 429.
 * Retorna null quando em cooldown ou após trip 429 (sem prolongar o bloqueio).
 */
async function spotifyApiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  if (isSpotifyCoolingDown()) {
    return null
  }

  const response = await fetch(url, init)

  if (response.status === 429) {
    tripSpotifyCooldown(response.headers.get('Retry-After'))
    return null
  }

  return response
}

async function getAccessToken(): Promise<string> {
  if (isSpotifyCoolingDown()) {
    throw new Error('Spotify em cooldown (429)')
  }

  const now = Date.now()

  if (cachedAccessToken && now < cachedExpiresAt) {
    return cachedAccessToken
  }

  const persisted = readPersistedToken()
  if (persisted && now < persisted.expiresAt) {
    cachedAccessToken = persisted.accessToken
    cachedExpiresAt = persisted.expiresAt
    return persisted.accessToken
  }

  if (inFlightTokenPromise) return inFlightTokenPromise

  inFlightTokenPromise = (async () => {
    const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID
    const clientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('Credenciais do Spotify ausentes no .env')
      throw new Error('Credenciais do Spotify ausentes no .env')
    }

    // Em dev: Vite proxy /api/token -> https://accounts.spotify.com/api/token (evita CORS)
    const response = await fetch('/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(clientId + ':' + clientSecret),
      },
      body: 'grant_type=client_credentials',
    })

    if (response.status === 429) {
      tripSpotifyCooldown(response.headers.get('Retry-After'))
      throw new Error('Spotify token 429 — cooldown ativo')
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(
        'Credenciais do Spotify ausentes no .env ou inválidas:',
        errorBody,
      )
      throw new Error(`Falha na autenticação Spotify (${response.status})`)
    }

    const data = (await response.json()) as SpotifyTokenResponse
    // Renova 60s antes do expires_in oficial
    const expiresAt = Date.now() + Math.max(30, data.expires_in - 60) * 1000
    persistToken(data.access_token, expiresAt)
    console.log('Token Spotify gerado com sucesso!')
    return data.access_token
  })().finally(() => {
    inFlightTokenPromise = null
  })

  return inFlightTokenPromise
}

function mapPlaylistItems(
  items: Array<{
    id: string
    name: string
    description: string | null
    images: Array<{ url: string }> | null
  } | null>,
): SpotifyPlaylist[] {
  return items
    .filter(
      (item): item is NonNullable<typeof item> =>
        item != null && Boolean(item.id) && Boolean(item.name),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      imageUrl: item.images?.[0]?.url ?? '',
    }))
}

function normalizePlaylistTrackItems(
  items: Array<SpotifyPlaylistTrackItem | null> | undefined,
): SpotifyPlaylistTrackItem[] {
  return (items ?? [])
    .filter((item): item is SpotifyPlaylistTrackItem => item != null)
    .map((item) => ({
      track: item.track ?? null,
    }))
    .filter((item) => Boolean(item.track?.id) && Boolean(item.track?.name))
}

export async function searchPlaylistsByQuery(
  query: string,
  limit: number = 6,
): Promise<SpotifyPlaylist[]> {
  try {
    if (isSpotifyCoolingDown()) return []

    const token = await getAccessToken()
    const safeLimit = clampSearchLimit(limit)
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=${safeLimit}`

    const response = await spotifyApiFetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    })

    if (!response) return []

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(errorBody)
      throw new Error(`Falha ao buscar playlists (${response.status})`)
    }

    const data = (await response.json()) as SpotifySearchPlaylistsResponse
    return mapPlaylistItems(data.playlists?.items ?? [])
  } catch (error) {
    console.error('Erro ao buscar playlists:', error)
    return []
  }
}

/** @deprecated Preferir `searchPlaylistsByQuery` com termos específicos. */
export async function getFeaturedPlaylists(): Promise<SpotifyPlaylist[]> {
  return searchPlaylistsByQuery('pop', 10)
}

export async function searchTracksByQuery(
  query: string,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const normalized = normalizeQueryKey(query)
  if (!normalized) return []

  const cacheKey = `${SEARCH_TRACKS_CACHE_PREFIX}${normalized}|${clampSearchLimit(limit)}`
  const cached = readTimedCache<SpotifyTrack[]>(cacheKey, SEARCH_CACHE_TTL_MS)
  if (cached) return cached

  try {
    if (isSpotifyCoolingDown()) return []

    const token = await getAccessToken()
    const safeLimit = clampSearchLimit(limit)
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${safeLimit}`

    const response = await spotifyApiFetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    })

    if (!response) return []

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(errorBody)
      throw new Error(`Falha na pesquisa de faixas (${response.status})`)
    }

    const data = (await response.json()) as SpotifyCatalogApiResponse

    const tracks = (data.tracks?.items ?? [])
      .filter(
        (item): item is NonNullable<typeof item> =>
          item != null && Boolean(item.id) && Boolean(item.name),
      )
      .map((item) => {
        const artists = (item.artists ?? [])
          .filter((artist) => Boolean(artist.name))
          .map((artist, index) => ({
            id: artist.id || `artist-${item.id}-${index}`,
            name: artist.name,
          }))

        return {
          id: item.id,
          name: item.name,
          artistName: artists[0]?.name ?? 'Artista desconhecido',
          artists,
          albumCoverUrl: item.album?.images?.[0]?.url ?? '',
          albumName: item.album?.name,
          albumReleaseDate: item.album?.release_date,
          durationMs: item.duration_ms,
        }
      })

    writeTimedCache(cacheKey, tracks)
    return tracks
  } catch (error) {
    console.error('Erro ao buscar faixas relacionadas:', error)
    return []
  }
}

export interface ArtistTracksPageResult {
  tracks: ArtistProfileTrack[]
  nextOffset: number
  hasMore: boolean
}

function trackMatchesArtist(
  artists: Array<{ id?: string; name?: string }> | null | undefined,
  artistId: string,
  artistName: string,
): boolean {
  const exactId = artistId?.trim()
  const nameLower = artistName.trim().toLowerCase()

  return (artists ?? []).some(
    (a) =>
      (Boolean(exactId) && a.id === exactId) ||
      a.name?.toLowerCase() === nameLower,
  )
}

function mapSearchItemsToArtistTracks(
  rawItems: NonNullable<NonNullable<SpotifyCatalogApiResponse['tracks']>['items']>,
): ArtistProfileTrack[] {
  return rawItems
    .filter(
      (item): item is NonNullable<typeof item> =>
        item != null && Boolean(item.id) && Boolean(item.name),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      artists: (item.artists ?? [])
        .filter((artist) => Boolean(artist.name))
        .map((artist, index) => ({
          id: artist.id || `artist-${item.id}-${index}`,
          name: artist.name,
        })),
      album: item.album
        ? {
            name: item.album.name,
            release_date: item.album.release_date,
            images: item.album.images,
          }
        : null,
      duration_ms: item.duration_ms,
    }))
}

async function searchTracksByQueryRaw(
  token: string,
  query: string,
  limit: number,
  offset: number = 0,
): Promise<NonNullable<NonNullable<SpotifyCatalogApiResponse['tracks']>['items']>> {
  if (isSpotifyCoolingDown()) return []

  const safeLimit = clampSearchLimit(limit)
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${safeLimit}&offset=${offset}`
  const response = await spotifyApiFetch(url, {
    headers: { Authorization: 'Bearer ' + token },
  })

  if (!response) return []

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(errorBody)
    throw new Error(`Falha na pesquisa de faixas (${response.status})`)
  }

  const data = (await response.json()) as SpotifyCatalogApiResponse
  return (data.tracks?.items ?? []).filter(
    (item): item is NonNullable<typeof item> =>
      item != null && Boolean(item.id) && Boolean(item.name),
  )
}

/**
 * Página de faixas do artista via /v1/search (limit máx. 10, offset ≥ 0).
 * Usa artist:"Nome" + busca simples; filtra por id ou nome exato.
 */
export async function searchArtistTracksPage(
  artistName: string,
  artistId: string,
  offset: number = 0,
  limit: number = 10,
): Promise<ArtistTracksPageResult> {
  const safeLimit = clampSearchLimit(limit)
  const safeOffset = Math.max(0, Math.floor(offset))
  const query = artistName.trim()

  if (!query) {
    return { tracks: [], nextOffset: safeOffset, hasMore: false }
  }

  try {
    const token = await getAccessToken()
    const filterQuery = `artist:"${query}"`

    let rawItems = await searchTracksByQueryRaw(
      token,
      filterQuery,
      safeLimit,
      safeOffset,
    )

    // Cascata: se o filtro artist: não trouxe página útil, tenta o nome simples
    if (rawItems.length === 0 && safeOffset === 0) {
      rawItems = await searchTracksByQueryRaw(
        token,
        query,
        safeLimit,
        safeOffset,
      )
    }

    const filtered = rawItems.filter((item) =>
      trackMatchesArtist(item.artists, artistId, query),
    )

    const tracks = mapSearchItemsToArtistTracks(filtered)
    const nextOffset = safeOffset + safeLimit
    const hasMore = rawItems.length >= safeLimit

    return { tracks, nextOffset, hasMore }
  } catch (error) {
    console.error('Erro ao paginar catálogo do artista:', error)
    return { tracks: [], nextOffset: safeOffset, hasMore: false }
  }
}

type SoundCloudArtistTrackApi = {
  id: string
  name: string
  artistName: string
  durationMs: number
  artworkUrl: string | null
  permalinkUrl: string | null
}

export type AllArtistTracksResult = {
  tracks: ArtistProfileTrack[]
  total: number
  soundcloudTotal: number
}

function normalizeTrackTitle(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

function mergeTracksByNormalizedTitle(
  preferred: ArtistProfileTrack[],
  extras: ArtistProfileTrack[],
): ArtistProfileTrack[] {
  const byTitle = new Map<string, ArtistProfileTrack>()
  const byId = new Set<string>()

  for (const track of preferred) {
    if (!track?.id || !track.name) continue
    byId.add(track.id)
    const key = normalizeTrackTitle(track.name)
    if (!byTitle.has(key)) byTitle.set(key, track)
  }

  for (const track of extras) {
    if (!track?.id || !track.name) continue
    if (byId.has(track.id)) continue
    const key = normalizeTrackTitle(track.name)
    if (byTitle.has(key)) continue
    byId.add(track.id)
    byTitle.set(key, track)
  }

  return [...byTitle.values()]
}

async function fetchSoundCloudArtistTracks(
  artistName: string,
): Promise<{ tracks: ArtistProfileTrack[]; total: number }> {
  try {
    const response = await fetch(
      `http://localhost:3001/api/artist-tracks?name=${encodeURIComponent(artistName.trim())}`,
    )
    if (!response.ok) return { tracks: [], total: 0 }

    const data = (await response.json()) as {
      tracks?: SoundCloudArtistTrackApi[] | null
      total?: number
    }

    const tracks: ArtistProfileTrack[] = (data.tracks ?? [])
      .filter((item) => Boolean(item?.id) && Boolean(item?.name))
      .map((item) => ({
        id: item.id,
        name: item.name,
        artists: [{ name: item.artistName || artistName }],
        duration_ms: item.durationMs || undefined,
        album: {
          name: item.name,
          images: item.artworkUrl ? [{ url: item.artworkUrl }] : null,
        },
      }))

    return {
      tracks,
      total:
        typeof data.total === 'number' && data.total > 0
          ? data.total
          : tracks.length,
    }
  } catch (error) {
    console.error('Erro ao buscar faixas SoundCloud do artista:', error)
    return { tracks: [], total: 0 }
  }
}

async function fetchSpotifyArtistAlbums(
  token: string,
  artistId: string,
  artistName: string,
): Promise<SpotifyAlbumItem[]> {
  const headers = { Authorization: `Bearer ${token}` }
  const albums: SpotifyAlbumItem[] = []
  const seen = new Set<string>()

  if (isSpotifyCoolingDown()) return albums

  // 1) Discografia oficial quando o ID Spotify é válido
  try {
    const res = await spotifyApiFetch(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=50&market=US`,
      { headers },
    )
    if (res?.ok) {
      const data = (await res.json()) as SpotifyAlbumsApiPayload
      for (const album of data.items ?? []) {
        if (!album?.id || !album.name || seen.has(album.id)) continue
        seen.add(album.id)
        albums.push(album)
      }
    }
  } catch (error) {
    console.warn('Falha albums por artistId:', error)
  }

  if (isSpotifyCoolingDown()) return albums

  // 2) Complemento via search type=album
  try {
    const res = await spotifyApiFetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName.trim())}&type=album&limit=${clampSearchLimit(10)}`,
      { headers },
    )
    if (res?.ok) {
      const data = (await res.json()) as SpotifyArtistSearchApiPayload
      for (const album of data.albums?.items ?? []) {
        if (!album?.id || !album.name || seen.has(album.id)) continue
        if (!trackMatchesArtist(album.artists ?? [], artistId, artistName)) {
          continue
        }
        seen.add(album.id)
        albums.push(album)
      }
    }
  } catch (error) {
    console.warn('Falha albums via search:', error)
  }

  return albums
}

/**
 * Catálogo unificado do artista: Spotify (search paginado + discografia)
 * + SoundCloud (/api/artist-tracks), deduplicado por título normalizado.
 */
export async function getAllArtistTracks(
  artistId: string,
  artistName: string,
  options?: { artistImageUrl?: string | null },
): Promise<AllArtistTracksResult> {
  const name = artistName.trim()
  if (!name) {
    return { tracks: [], total: 0, soundcloudTotal: 0 }
  }

  try {
    const token = await getAccessToken()
    const filterQuery = `artist:"${name}"`

    const [page0, page10, page20, albums, soundcloud] = await Promise.all([
      searchTracksByQueryRaw(token, filterQuery, 10, 0).catch(() => []),
      searchTracksByQueryRaw(token, filterQuery, 10, 10).catch(() => []),
      searchTracksByQueryRaw(token, filterQuery, 10, 20).catch(() => []),
      fetchSpotifyArtistAlbums(token, artistId, name),
      fetchSoundCloudArtistTracks(name),
    ])

    const searchRaw = [...page0, ...page10, ...page20].filter((item) =>
      trackMatchesArtist(item.artists, artistId, name),
    )
    const fromSearch = mapSearchItemsToArtistTracks(searchRaw)

    const fromDiscography = await fetchTracksFromDiscography(
      token,
      albums,
      Math.min(20, Math.max(albums.length, 1)),
    )

    const spotifyTracks = mergeTracksByNormalizedTitle(
      fromSearch,
      fromDiscography.filter((t) =>
        trackMatchesArtist(t.artists, artistId, name),
      ),
    )

    const avatarFallback = options?.artistImageUrl?.trim() || null
    const soundcloudTracks: ArtistProfileTrack[] = soundcloud.tracks.map(
      (track) => {
        const hasCover = Boolean(track.album?.images?.[0]?.url)
        if (hasCover || !avatarFallback) return track
        return {
          ...track,
          album: {
            name: track.album?.name ?? track.name,
            images: [{ url: avatarFallback }],
          },
        }
      },
    )

    const unified = mergeTracksByNormalizedTitle(
      spotifyTracks,
      soundcloudTracks,
    )

    // Total sincronizado: catálogo unificado vs contagem SoundCloud
    const total = Math.max(unified.length, soundcloud.total)

    return {
      tracks: unified,
      total,
      soundcloudTotal: soundcloud.total,
    }
  } catch (error) {
    console.error('Erro ao unificar catálogo do artista:', error)
    return { tracks: [], total: 0, soundcloudTotal: 0 }
  }
}

export async function searchCatalog(
  query: string,
): Promise<SpotifyCatalogSearchResult> {
  const empty: SpotifyCatalogSearchResult = {
    tracks: [],
    artists: [],
    playlists: [],
  }

  const normalized = normalizeQueryKey(query)
  if (!normalized) return empty

  const cacheKey = `${SEARCH_CATALOG_CACHE_PREFIX}${normalized}`
  const cached = readTimedCache<SpotifyCatalogSearchResult>(
    cacheKey,
    SEARCH_CACHE_TTL_MS,
  )
  if (cached) return cached

  try {
    if (isSpotifyCoolingDown()) return empty

    const token = await getAccessToken()
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist,track&limit=10`

    const response = await spotifyApiFetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    })

    if (!response) return empty

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(errorBody)
      throw new Error(`Falha na pesquisa (${response.status})`)
    }

    const data = (await response.json()) as SpotifyCatalogApiResponse

    const tracks: SpotifyTrack[] = (data.tracks?.items ?? [])
      .filter(
        (item): item is NonNullable<typeof item> =>
          item != null && Boolean(item.id) && Boolean(item.name),
      )
      .map((item) => {
        const artists = (item.artists ?? [])
          .filter((artist) => Boolean(artist.name))
          .map((artist, index) => ({
            id: artist.id || `artist-${item.id}-${index}`,
            name: artist.name,
          }))

        return {
          id: item.id,
          name: item.name,
          artistName: artists[0]?.name ?? 'Artista desconhecido',
          artists,
          albumCoverUrl: item.album?.images?.[0]?.url ?? '',
          albumName: item.album?.name,
          albumReleaseDate: item.album?.release_date,
          durationMs: item.duration_ms,
        }
      })

    let artists: SpotifyArtist[] = (data.artists?.items ?? [])
      .filter(
        (item): item is NonNullable<typeof item> =>
          item != null && Boolean(item.id) && Boolean(item.name),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        imageUrl: item.images?.[0]?.url ?? '',
      }))

    // Fallback: artistas underground podem não vir em artists, mas aparecem em tracks
    if (artists.length === 0 && tracks.length > 0) {
      const seen = new Set<string>()
      artists = []

      for (const item of data.tracks?.items ?? []) {
        if (!item) continue
        const coverUrl = item.album?.images?.[0]?.url ?? ''

        for (const artist of item.artists ?? []) {
          if (!artist.id || !artist.name || seen.has(artist.id)) continue
          seen.add(artist.id)
          artists.push({
            id: artist.id,
            name: artist.name,
            imageUrl: coverUrl,
          })
        }
      }
    }

    const result: SpotifyCatalogSearchResult = {
      tracks,
      artists,
      playlists: [],
    }
    writeTimedCache(cacheKey, result)
    return result
  } catch (error) {
    console.error('Erro na pesquisa oficial do Spotify:', error)
    return empty
  }
}

async function fetchPlaylistItems(
  token: string,
  playlistId: string,
): Promise<{ total: number; items: SpotifyPlaylistTrackItem[] }> {
  // Endpoint novo (migração Spotify): /items — com fallback para /tracks
  const endpoints = [
    `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&market=US&additional_types=track`,
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&market=US&additional_types=track`,
  ]

  for (const url of endpoints) {
    try {
      if (isSpotifyCoolingDown()) return { total: 0, items: [] }

      const response = await spotifyApiFetch(url, {
        headers: {
          Authorization: 'Bearer ' + token,
        },
      })

      if (!response) return { total: 0, items: [] }

      if (!response.ok) {
        const errorBody = await response.text()
        console.warn(`Playlist items falhou (${response.status}):`, url, errorBody)
        continue
      }

      const data = (await response.json()) as SpotifyPlaylistItemsApiResponse
      const items: SpotifyPlaylistTrackItem[] = (data.items ?? [])
        .map((entry) => {
          const track = entry?.track ?? entry?.item ?? null
          return { track }
        })
        .filter((item) => Boolean(item.track?.id) && Boolean(item.track?.name))

      if (items.length > 0) {
        return {
          total: data.total ?? items.length,
          items,
        }
      }
    } catch (error) {
      console.warn('Erro ao buscar items da playlist:', error)
    }
  }

  return { total: 0, items: [] }
}

async function searchTracksAsPlaylistItems(
  query: string,
  limit = 20,
): Promise<{ total: number; items: SpotifyPlaylistTrackItem[] }> {
  const catalog = await searchCatalog(query)
  const items: SpotifyPlaylistTrackItem[] = catalog.tracks
    .slice(0, limit)
    .map((track) => ({
      track: {
        id: track.id,
        name: track.name,
        duration_ms: track.durationMs,
        artists: track.artists.map((artist) => ({
          id: artist.id,
          name: artist.name,
        })),
        album: {
          name: track.albumName,
          release_date: track.albumReleaseDate,
          images: track.albumCoverUrl ? [{ url: track.albumCoverUrl }] : [],
        },
      },
    }))

  return {
    total: items.length,
    items,
  }
}

export interface ArtistProfileAlbum {
  id: string
  name: string
  year: string
  imageUrl: string
  albumType: 'album' | 'single' | 'compilation' | string
}

export interface ArtistProfileTrack {
  id: string
  name: string
  artists: Array<{ id?: string; name: string }>
  album?: {
    id?: string
    name?: string
    release_date?: string
    images?: Array<{ url: string }> | null
  } | null
  duration_ms?: number
}

export interface ArtistProfile {
  id: string
  name: string
  images: Array<{ url: string }>
  bannerUrl: string | null
  followers: number
  genres: string[]
  popularity: number
  topTracks: ArtistProfileTrack[]
  albums: ArtistProfileAlbum[]
  /** Total de faixas (Spotify top + SoundCloud track_count). */
  totalTracksCount: number
  location: string | null
  description: string | null
  soundcloudUrl: string | null
}

interface ArtistMetaResponse {
  bannerUrl?: string | null
  followersCount?: number | null
  trackCount?: number | null
  location?: string | null
  description?: string | null
  permalinkUrl?: string | null
}

interface SpotifyArtistApiPayload {
  id: string
  name: string
  images?: Array<{ url: string }> | null
  followers?: { total?: number } | null
  genres?: string[] | null
  popularity?: number | null
}

interface SpotifyTopTracksApiPayload {
  tracks?: Array<{
    id: string
    name: string
    duration_ms: number
    artists?: Array<{ id?: string; name: string }>
    album?: {
      id?: string
      name?: string
      release_date?: string
      images?: Array<{ url: string }> | null
    } | null
  } | null>
}

type SpotifyAlbumItem = {
  id: string
  name: string
  album_type?: string
  release_date?: string
  images?: Array<{ url: string }> | null
  artists?: Array<{ id?: string; name: string }> | null
}

interface SpotifyAlbumsApiPayload {
  items?: Array<SpotifyAlbumItem | null>
}

interface SpotifyArtistSearchApiPayload {
  artists?: {
    items?: Array<SpotifyArtistApiPayload | null>
  } | null
  tracks?: {
    items?: SpotifyTopTracksApiPayload['tracks']
  } | null
  albums?: {
    items?: Array<SpotifyAlbumItem | null>
  } | null
}

function mapArtistTopTracks(
  tracks: SpotifyTopTracksApiPayload['tracks'],
): ArtistProfileTrack[] {
  return (tracks ?? [])
    .filter(
      (track): track is NonNullable<typeof track> =>
        track != null && Boolean(track.id) && Boolean(track.name),
    )
    .map((track) => ({
      id: track.id,
      name: track.name,
      artists: (track.artists ?? []).map((a) => ({
        id: a.id,
        name: a.name,
      })),
      album: track.album ?? null,
      duration_ms: track.duration_ms,
    }))
}

/** Extrai a array de faixas do payload oficial `{ tracks: [...] }`. */
function extractTopTracksFromPayload(
  payload: SpotifyTopTracksApiPayload | ArtistProfileTrack[] | null | undefined,
): ArtistProfileTrack[] {
  if (!payload) return []

  // Defesa: se alguém passar a array direto
  if (Array.isArray(payload)) {
    return mapArtistTopTracks(payload as SpotifyTopTracksApiPayload['tracks'])
  }

  // Shape oficial do endpoint /v1/artists/{id}/top-tracks
  const topTracks = payload.tracks || []
  return mapArtistTopTracks(topTracks)
}

function mapArtistAlbums(
  items: SpotifyAlbumsApiPayload['items'],
): ArtistProfileAlbum[] {
  return (items ?? [])
    .filter(
      (album): album is NonNullable<typeof album> =>
        album != null && Boolean(album.id) && Boolean(album.name),
    )
    .map((album) => ({
      id: album.id,
      name: album.name,
      year: album.release_date?.slice(0, 4) ?? '—',
      imageUrl: album.images?.[0]?.url ?? '',
      albumType: album.album_type ?? 'album',
    }))
}

/** Popularidade estimada (35–85) quando a API Spotify devolve 0. */
function estimateArtistPopularity(
  followers: number,
  trackCount: number,
  albumCount: number,
): number {
  const followerScore = Math.min(35, Math.log10(Math.max(followers, 1)) * 12)
  const catalogScore = Math.min(25, Math.log10(Math.max(trackCount + albumCount, 1)) * 10)
  return Math.min(85, Math.max(35, Math.round(35 + followerScore + catalogScore)))
}

function buildArtistProfile(
  artist: SpotifyArtistApiPayload,
  topTracks: ArtistProfileTrack[],
  albums: ArtistProfileAlbum[],
  meta: ArtistMetaResponse | null = null,
): ArtistProfile {
  const followers =
    artist.followers?.total || meta?.followersCount || 0

  const trackCount = meta?.trackCount || 0
  const totalTracksCount = Math.max(topTracks.length, trackCount)
  const popularity =
    artist.popularity && artist.popularity > 0
      ? artist.popularity
      : estimateArtistPopularity(followers, totalTracksCount, albums.length)

  return {
    id: artist.id,
    name: artist.name,
    images: (artist.images ?? []).filter((img) => Boolean(img?.url)),
    bannerUrl: meta?.bannerUrl ?? null,
    followers,
    genres: artist.genres ?? [],
    popularity,
    topTracks,
    albums,
    totalTracksCount,
    location: meta?.location ?? null,
    description: meta?.description ?? null,
    soundcloudUrl: meta?.permalinkUrl ?? null,
  }
}

async function fetchArtistMeta(
  artistName: string,
): Promise<ArtistMetaResponse | null> {
  try {
    const response = await fetch(
      `http://localhost:3001/api/artist-meta?name=${encodeURIComponent(artistName)}`,
    )
    if (!response.ok) return null
    return (await response.json()) as ArtistMetaResponse
  } catch (error) {
    console.error('Erro ao buscar metadados do artista:', error)
    return null
  }
}

interface SpotifyAlbumTracksApiPayload {
  items?: Array<{
    id: string
    name: string
    duration_ms?: number
    artists?: Array<{ id?: string; name: string }>
  } | null> | null
}

/** Busca faixas dos primeiros álbuns/singles da discografia (fallback garantido). */
async function fetchTracksFromDiscography(
  token: string,
  albums: SpotifyAlbumItem[],
  maxAlbums = 5,
): Promise<ArtistProfileTrack[]> {
  const selected = albums
    .filter((album) => Boolean(album?.id) && Boolean(album?.name))
    .slice(0, maxAlbums)

  if (selected.length === 0) return []

  const pages = await Promise.all(
    selected.map(async (album) => {
      try {
        if (isSpotifyCoolingDown()) return [] as ArtistProfileTrack[]

        const response = await spotifyApiFetch(
          `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        )

        if (!response) return [] as ArtistProfileTrack[]

        if (!response.ok) {
          const errorBody = await response.text()
          console.warn(
            `Falha ao buscar faixas do álbum ${album.id}:`,
            errorBody,
          )
          return [] as ArtistProfileTrack[]
        }

        const data = (await response.json()) as SpotifyAlbumTracksApiPayload

        return (data.items ?? [])
          .filter(
            (track): track is NonNullable<typeof track> =>
              track != null && Boolean(track.id) && Boolean(track.name),
          )
          .map((track) => ({
            id: track.id,
            name: track.name,
            artists: (track.artists ?? []).map((a) => ({
              id: a.id,
              name: a.name,
            })),
            duration_ms: track.duration_ms,
            album: {
              id: album.id,
              name: album.name,
              release_date: album.release_date,
              images: album.images ?? null,
            },
          }))
      } catch (error) {
        console.warn('Erro ao buscar faixas da discografia:', error)
        return [] as ArtistProfileTrack[]
      }
    }),
  )

  const seen = new Set<string>()
  const merged: ArtistProfileTrack[] = []

  for (const track of pages.flat()) {
    if (seen.has(track.id)) continue
    seen.add(track.id)
    merged.push(track)
  }

  return merged
}

export async function getArtistProfile(
  id: string,
  artistName?: string,
): Promise<ArtistProfile | null> {
  try {
    const token = await getAccessToken()
    const headers = { Authorization: `Bearer ${token}` }
    let artistId = id
    let artistData: SpotifyArtistApiPayload | null = null

    // 1. Tentar buscar pelo ID direto
    const artistRes = await spotifyApiFetch(
      `https://api.spotify.com/v1/artists/${id}`,
      { headers },
    )

    if (artistRes?.ok) {
      artistData = (await artistRes.json()) as SpotifyArtistApiPayload
    } else if (artistName?.trim() && !isSpotifyCoolingDown()) {
      // 2. Fallback: se o ID falhar (ex.: mock), pesquisar pelo nome
      const searchRes = await spotifyApiFetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName.trim())}&type=artist&limit=1`,
        { headers },
      )
      if (searchRes?.ok) {
        const searchData =
          (await searchRes.json()) as SpotifyArtistSearchApiPayload
        const found = (searchData.artists?.items ?? []).find(
          (item): item is SpotifyArtistApiPayload =>
            item != null && Boolean(item.id) && Boolean(item.name),
        )

        if (found) {
          artistData = found
          artistId = found.id
        }
      }
    }

    if (!artistData) throw new Error('Artista não encontrado no Spotify')

    // 3. ESTRATÉGIA DE BUSCA — catalog + artist:"Nome" + discografia
    //    + metadados SoundCloud (banner, seguidores, bio…) via backend Azuri
    let topTracks: ArtistProfileTrack[] = []
    let albums: SpotifyAlbumItem[] = []
    let artistMeta: ArtistMetaResponse | null = null

    try {
      const exactArtistId = artistData.id?.trim()
      const artistQuery = artistData.name.trim()

      const matchesArtist = (
        artists: Array<{ id?: string; name?: string }> = [],
      ) => trackMatchesArtist(artists, exactArtistId, artistQuery)

      const mergeUniqueTopTracks = (incoming: ArtistProfileTrack[]) => {
        const seen = new Set(topTracks.map((t) => t.id))
        for (const track of incoming) {
          if (!track.id || seen.has(track.id)) continue
          seen.add(track.id)
          topTracks.push(track)
        }
      }

      const [catalog, metaResult, searchAlbumsRes, artistFilterRaw] =
        await Promise.all([
          searchCatalog(artistQuery),
          fetchArtistMeta(artistQuery),
          isSpotifyCoolingDown()
            ? Promise.resolve(null)
            : spotifyApiFetch(
                `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistQuery)}&type=album&limit=10`,
                { headers: { Authorization: 'Bearer ' + token } },
              ),
          searchTracksByQueryRaw(token, `artist:"${artistQuery}"`, 10, 0),
        ])

      artistMeta = metaResult

      mergeUniqueTopTracks(
        catalog.tracks
          .filter((t) => matchesArtist(t.artists))
          .map((t) => ({
            id: t.id,
            name: t.name,
            artists: t.artists,
            album: {
              name: t.albumName,
              release_date: t.albumReleaseDate,
              images: t.albumCoverUrl ? [{ url: t.albumCoverUrl }] : null,
            },
            duration_ms: t.durationMs,
          })),
      )

      mergeUniqueTopTracks(
        mapSearchItemsToArtistTracks(
          artistFilterRaw.filter((item) =>
            trackMatchesArtist(item.artists, exactArtistId, artistQuery),
          ),
        ),
      )

      if (searchAlbumsRes && !searchAlbumsRes.ok) {
        const err = await searchAlbumsRes.json()
        console.error('Erro Spotify albums:', JSON.stringify(err))
      } else if (searchAlbumsRes?.ok) {
        const aData = (await searchAlbumsRes.json()) as SpotifyArtistSearchApiPayload
        const uniqueAlbums = Array.from(
          new Map(
            (aData.albums?.items || [])
              .filter(
                (a): a is SpotifyAlbumItem =>
                  a != null &&
                  Boolean(a.id) &&
                  Boolean(a.name) &&
                  matchesArtist(a.artists ?? []),
              )
              .map((item) => [item.name, item]),
          ).values(),
        )
        albums = uniqueAlbums
      }

      // Fallback obrigatório: discografia → faixas dos singles/álbuns
      if (topTracks.length === 0 && albums.length > 0) {
        const fromAlbums = await fetchTracksFromDiscography(
          token,
          albums,
          5,
        )
        mergeUniqueTopTracks(fromAlbums)
      }
    } catch (error) {
      console.error('Erro na busca segura do Spotify:', JSON.stringify(error, Object.getOwnPropertyNames(error as object)))
    }

    // 4. FALLBACK ITUNES (Apenas se o Spotify falhar completamente)
    if (topTracks.length === 0 && albums.length === 0) {
      console.warn('Recorrendo ao iTunes como último recurso...');
      try {
        const [itunesTracks, itunesAlbums] = await Promise.all([
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistData.name)}&entity=song&limit=50`),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistData.name)}&entity=album&limit=50`)
        ]);

        if (itunesTracks.ok) {
          const data = await itunesTracks.json();
          topTracks = data.results.map((item: any) => ({
            id: item.trackId.toString(),
            name: item.trackName,
            artists: [{ id: item.artistId?.toString(), name: item.artistName }],
            duration_ms: item.trackTimeMillis,
            album: { id: item.collectionId?.toString(), name: item.collectionName, images: [{ url: item.artworkUrl100?.replace('100x100bb', '300x300bb') }] }
          }));
        }
        
        if (itunesAlbums.ok) {
          const data = await itunesAlbums.json();
          albums = data.results.map((item: any) => ({
            id: item.collectionId.toString(),
            name: item.collectionName,
            album_type: 'album',
            release_date: item.releaseDate,
            images: [{ url: item.artworkUrl100?.replace('100x100bb', '300x300bb') }]
          }));
        }
      } catch (e) {
        console.error('Erro no fallback do iTunes:', e);
      }
    }

    // 5. Retornar objeto formatado para a UI
    return buildArtistProfile(
      artistData,
      extractTopTracksFromPayload({ tracks: topTracks }),
      mapArtistAlbums(albums),
      artistMeta,
    )
  } catch (error) {
    console.error('Erro ao carregar perfil:', error)
    return null
  }
}

export async function getPlaylistDetails(
  playlistId: string,
): Promise<SpotifyPlaylistDetails | null> {
  try {
    if (isSpotifyCoolingDown()) return null

    const token = await getAccessToken()

    const response = await spotifyApiFetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?market=US`,
      {
        headers: {
          Authorization: 'Bearer ' + token,
        },
      },
    )

    if (!response) return null

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(errorBody)
      throw new Error(`Falha ao carregar playlist (${response.status})`)
    }

    const data = (await response.json()) as SpotifyPlaylistApiResponse

    let items = normalizePlaylistTrackItems(data.tracks?.items)
    let total = data.tracks?.total ?? items.length

    // Se a resposta da playlist vier sem items, tenta endpoints dedicados da API.
    if (items.length === 0) {
      const fetched = await fetchPlaylistItems(token, playlistId)
      items = fetched.items
      total = fetched.total || total
    }

    // Complemento via search oficial do Spotify quando a playlist não traz tracks.
    if (items.length === 0 && data.name) {
      const fallback = await searchTracksAsPlaylistItems(data.name, 20)
      items = fallback.items
      total = fallback.total
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description ?? '',
      imageUrl: data.images?.[0]?.url ?? '',
      ownerName: data.owner?.display_name ?? 'Spotify',
      tracks: {
        total,
        items,
      },
    }
  } catch (error) {
    console.error('Erro ao carregar playlist:', error)
    return null
  }
}

export async function getAlbumDetails(id: string) {
  try {
    if (isSpotifyCoolingDown()) return null

    const token = await getAccessToken()
    const res = await spotifyApiFetch(`https://api.spotify.com/v1/albums/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res) return null
    if (!res.ok) throw new Error('Falha ao buscar álbum no Spotify')

    const data = await res.json()

    // Formatar para garantir compatibilidade com o nosso player e lista
    return {
      ...data,
      tracks:
        data.tracks?.items.map((track: any) => ({
          ...track,
          album: { id: data.id, name: data.name, images: data.images }, // Injetar a capa nas faixas para o player
        })) || [],
    }
  } catch (error) {
    console.error('Erro ao buscar detalhes do álbum:', error)
    return null
  }
}
