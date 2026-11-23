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

async function getAccessToken(): Promise<string> {
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

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(
      'Credenciais do Spotify ausentes no .env ou inválidas:',
      errorBody,
    )
    throw new Error(`Falha na autenticação Spotify (${response.status})`)
  }

  const data = (await response.json()) as SpotifyTokenResponse
  console.log('Token Spotify gerado com sucesso!')
  return data.access_token
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
    const token = await getAccessToken()
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=${limit}`

    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    })

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
  limit = 15,
): Promise<SpotifyTrack[]> {
  try {
    const token = await getAccessToken()
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${Math.min(50, Math.max(1, limit))}`

    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(errorBody)
      throw new Error(`Falha na pesquisa de faixas (${response.status})`)
    }

    const data = (await response.json()) as SpotifyCatalogApiResponse

    return (data.tracks?.items ?? [])
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

/**
 * Página de faixas do artista via /v1/search (limit máx. 50, offset ≥ 0).
 * Filtra apenas faixas cujo artista corresponde a artistId/artistName.
 */
export async function searchArtistTracksPage(
  artistName: string,
  artistId: string,
  offset: number = 0,
  limit: number = 10,
): Promise<ArtistTracksPageResult> {
  const safeLimit = Math.min(50, Math.max(1, limit))
  const safeOffset = Math.max(0, Math.floor(offset))
  const query = artistName.trim()

  if (!query) {
    return { tracks: [], nextOffset: safeOffset, hasMore: false }
  }

  try {
    const token = await getAccessToken()
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${safeLimit}&offset=${safeOffset}`

    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(errorBody)
      throw new Error(`Falha ao paginar faixas do artista (${response.status})`)
    }

    const data = (await response.json()) as SpotifyCatalogApiResponse
    const rawItems = (data.tracks?.items ?? []).filter(
      (item): item is NonNullable<typeof item> =>
        item != null && Boolean(item.id) && Boolean(item.name),
    )

    const exactArtistId = artistId?.trim()
    const artistNameLower = query.toLowerCase()

    const tracks: ArtistProfileTrack[] = rawItems
      .filter((item) =>
        (item.artists ?? []).some((a) => {
          if (a.id && exactArtistId) return a.id === exactArtistId
          return a.name?.toLowerCase().includes(artistNameLower)
        }),
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

    const nextOffset = safeOffset + safeLimit
    // Spotify search: há mais resultados se a página veio cheia
    const hasMore = rawItems.length >= safeLimit

    return { tracks, nextOffset, hasMore }
  } catch (error) {
    console.error('Erro ao paginar catálogo do artista:', error)
    return { tracks: [], nextOffset: safeOffset, hasMore: false }
  }
}

export async function searchCatalog(
  query: string,
): Promise<SpotifyCatalogSearchResult> {
  try {
    const token = await getAccessToken()
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,artist,playlist&limit=10`

    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    })

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

    const artists: SpotifyArtist[] = (data.artists?.items ?? [])
      .filter(
        (item): item is NonNullable<typeof item> =>
          item != null && Boolean(item.id) && Boolean(item.name),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        imageUrl: item.images?.[0]?.url ?? '',
      }))

    return {
      tracks,
      artists,
      playlists: mapPlaylistItems(data.playlists?.items ?? []),
    }
  } catch (error) {
    console.error('Erro na pesquisa oficial do Spotify:', error)
    return { tracks: [], artists: [], playlists: [] }
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
      const response = await fetch(url, {
        headers: {
          Authorization: 'Bearer ' + token,
        },
      })

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
    const artistRes = await fetch(
      `https://api.spotify.com/v1/artists/${id}`,
      { headers },
    )

    if (artistRes.ok) {
      artistData = (await artistRes.json()) as SpotifyArtistApiPayload
    } else if (artistName?.trim()) {
      // 2. Fallback: se o ID falhar (ex.: mock), pesquisar pelo nome
      const searchRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName.trim())}&type=artist&limit=1`,
        { headers },
      )
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

    if (!artistData) throw new Error('Artista não encontrado no Spotify')

    // 3. ESTRATÉGIA DE BUSCA — reutiliza searchCatalog (mesma URL da página Search)
    //    + metadados SoundCloud (banner, seguidores, bio…) via backend Azuri
    let topTracks: any[] = []
    let albums: any[] = []
    let artistMeta: ArtistMetaResponse | null = null

    try {
      const exactArtistId = artistData.id?.trim()
      const artistQuery = artistData.name.trim()

      const matchesArtist = (artists: Array<{ id?: string; name?: string }> = []) =>
        artists.some((a) => {
          if (a.id && exactArtistId) return a.id === exactArtistId
          return a.name?.toLowerCase().includes(artistData.name.toLowerCase())
        })

      const [catalog, metaResult, searchAlbumsRes] = await Promise.all([
        searchCatalog(artistQuery),
        fetchArtistMeta(artistQuery),
        fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistQuery)}&type=album&limit=10`,
          { headers: { Authorization: 'Bearer ' + token } },
        ),
      ])

      artistMeta = metaResult

      topTracks = catalog.tracks
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
        }))

      if (!searchAlbumsRes.ok) {
        const err = await searchAlbumsRes.json()
        console.error('Erro Spotify albums:', JSON.stringify(err))
      } else {
        const aData = await searchAlbumsRes.json()
        const uniqueAlbums = Array.from(
          new Map(
            (aData.albums?.items || [])
              .filter((a: any) => matchesArtist(a.artists))
              .map((item: any) => [item.name, item]),
          ).values(),
        )
        albums = uniqueAlbums
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
    const token = await getAccessToken()

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?market=US`,
      {
        headers: {
          Authorization: 'Bearer ' + token,
        },
      },
    )

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
    const token = await getAccessToken()
    const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

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
