export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  imageUrl: string
}

export interface SpotifyPlaylistTrack {
  id: string
  title: string
  artist: string
  albumCoverUrl: string
  durationMs: number
}

export interface SpotifyPlaylistDetails {
  id: string
  name: string
  description: string
  imageUrl: string
  ownerName: string
  tracks: SpotifyPlaylistTrack[]
}

interface SpotifyPlaylistApiResponse {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }> | null
  owner: { display_name: string | null } | null
  tracks: {
    items: Array<{
      track: {
        id: string
        name: string
        duration_ms: number
        artists: Array<{ name: string }>
        album: { images: Array<{ url: string }> | null } | null
      } | null
    } | null>
  }
}

interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface SpotifySearchPlaylistsResponse {
  playlists: {
    items: Array<{
      id: string
      name: string
      description: string | null
      images: Array<{ url: string }> | null
    } | null>
  }
}

const SEARCH_PLAYLISTS_URL =
  'https://api.spotify.com/v1/search?q=pop&type=playlist&limit=10'

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
  console.log(data.access_token)
  return data.access_token
}

export async function getFeaturedPlaylists(): Promise<SpotifyPlaylist[]> {
  const token = await getAccessToken()
  console.log(token)

  const response = await fetch(SEARCH_PLAYLISTS_URL, {
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

  return data.playlists.items
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

export async function getPlaylistDetails(
  playlistId: string,
): Promise<SpotifyPlaylistDetails> {
  const token = await getAccessToken()

  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
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

  const tracks = data.tracks.items
    .map((item) => item?.track)
    .filter(
      (track): track is NonNullable<typeof track> =>
        track != null && Boolean(track.id) && Boolean(track.name),
    )
    .map((track) => ({
      id: track.id,
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(', '),
      albumCoverUrl: track.album?.images?.[0]?.url ?? '',
      durationMs: track.duration_ms,
    }))

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? '',
    imageUrl: data.images?.[0]?.url ?? '',
    ownerName: data.owner?.display_name ?? 'Spotify',
    tracks,
  }
}
