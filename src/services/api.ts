export interface Playlist {
  id: string
  title: string
  description: string
  coverUrl: string
}

const FEATURED_PLAYLISTS: Playlist[] = [
  {
    id: '1',
    title: 'Neon Nights',
    description: 'Synthwave & darkwave',
    coverUrl: 'https://picsum.photos/seed/azuri-1/300/300',
  },
  {
    id: '2',
    title: 'Focus Flow',
    description: 'Beats para concentrar',
    coverUrl: 'https://picsum.photos/seed/azuri-2/300/300',
  },
  {
    id: '3',
    title: 'Chill Azuri',
    description: 'Lo-fi e ambient',
    coverUrl: 'https://picsum.photos/seed/azuri-3/300/300',
  },
  {
    id: '4',
    title: 'Midnight Drive',
    description: 'Eletrônica noturna',
    coverUrl: 'https://picsum.photos/seed/azuri-4/300/300',
  },
  {
    id: '5',
    title: 'Brasil Remix',
    description: 'Hits repaginados',
    coverUrl: 'https://picsum.photos/seed/azuri-5/300/300',
  },
  {
    id: '6',
    title: 'Deep Blue',
    description: 'House e deep cuts',
    coverUrl: 'https://picsum.photos/seed/azuri-6/300/300',
  },
]

/** Mock da API — depois troca pela chamada real do Spotify. */
export async function getFeaturedPlaylists(): Promise<Playlist[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  return FEATURED_PLAYLISTS
}
