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
  albumCoverUrl: string
  albumName?: string
  albumReleaseDate?: string
  durationMs: number
}

export interface SpotifyRawTrack {
  id: string
  name: string
  duration_ms: number
  artists: Array<{ name: string }>
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
      artists: Array<{ name: string }>
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
  // Em dev: Vite proxy /api/token -> https://accounts.spotify.com/api/token (evita CORS)
  const response = await fetch('/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        btoa(
          import.meta.env.VITE_SPOTIFY_CLIENT_ID +
            ':' +
            import.meta.env.VITE_SPOTIFY_CLIENT_SECRET,
        ),
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(errorBody)
    throw new Error(`Falha na autenticação Spotify (${response.status})`)
  }

  const data = (await response.json()) as SpotifyTokenResponse
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
}

/** @deprecated Preferir `searchPlaylistsByQuery` com termos específicos. */
export async function getFeaturedPlaylists(): Promise<SpotifyPlaylist[]> {
  return searchPlaylistsByQuery('pop', 10)
}

export async function searchCatalog(
  query: string,
): Promise<SpotifyCatalogSearchResult> {
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
    .map((item) => ({
      id: item.id,
      name: item.name,
      artistName: item.artists?.[0]?.name ?? 'Artista desconhecido',
      albumCoverUrl: item.album?.images?.[0]?.url ?? '',
      albumName: item.album?.name,
      albumReleaseDate: item.album?.release_date,
      durationMs: item.duration_ms,
    }))

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
        artists: [{ name: track.artistName }],
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

export async function getPlaylistDetails(
  playlistId: string,
): Promise<SpotifyPlaylistDetails> {
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
  console.log('Resposta Playlist Spotify:', data)

  let items = normalizePlaylistTrackItems(data.tracks?.items)
  let total = data.tracks?.total ?? items.length

  // Spotify (modo desenvolvimento / client credentials) frequentemente
  // devolve tracks sem items ou 403 em /items — tenta endpoints dedicados.
  if (items.length === 0) {
    const fetched = await fetchPlaylistItems(token, playlistId)
    items = fetched.items
    total = fetched.total || total
  }

  // Último recurso: busca músicas pelo nome da playlist (Search type=track)
  // para a UI não ficar com "0 faixas" quando a API bloqueia o conteúdo.
  if (items.length === 0 && data.name) {
    console.warn(
      'Playlist sem tracks.items acessíveis. A usar fallback via searchCatalog.',
    )
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
}
