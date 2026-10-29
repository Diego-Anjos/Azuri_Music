import { useState } from 'react'

const newTracks = [
  { id: '1', imageUrl: 'https://picsum.photos/seed/track-1/80/80', name: 'Nova 1' },
  { id: '2', imageUrl: 'https://picsum.photos/seed/track-2/80/80', name: 'Nova 2' },
  { id: '3', imageUrl: 'https://picsum.photos/seed/track-3/80/80', name: 'Nova 3' },
  { id: '4', imageUrl: 'https://picsum.photos/seed/track-4/80/80', name: 'Nova 4' },
  { id: '5', imageUrl: 'https://picsum.photos/seed/track-5/80/80', name: 'Nova 5' },
  { id: '6', imageUrl: 'https://picsum.photos/seed/track-6/80/80', name: 'Nova 6' },
]

const suggestedArtists = [
  {
    id: '1',
    name: 'Nova Echo',
    followers: '128K seguidores',
    imageUrl: 'https://picsum.photos/seed/artist-1/96/96',
  },
  {
    id: '2',
    name: 'Cyan Drift',
    followers: '84K seguidores',
    imageUrl: 'https://picsum.photos/seed/artist-2/96/96',
  },
  {
    id: '3',
    name: 'Orbit Lane',
    followers: '210K seguidores',
    imageUrl: 'https://picsum.photos/seed/artist-3/96/96',
  },
  {
    id: '4',
    name: 'Velvet Static',
    followers: '56K seguidores',
    imageUrl: 'https://picsum.photos/seed/artist-4/96/96',
  },
  {
    id: '5',
    name: 'Soft Circuit',
    followers: '173K seguidores',
    imageUrl: 'https://picsum.photos/seed/artist-5/96/96',
  },
]

export function RightSidebar() {
  const [following, setFollowing] = useState<Record<string, boolean>>({})

  function toggleFollow(id: string) {
    setFollowing((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <aside className="hidden h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[#111827] xl:flex">
      <div className="px-5 pb-6 pt-6">
        <h2 className="mb-4 text-sm font-semibold text-[#F8FAFC]">Novas Faixas</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {newTracks.map((track) => (
            <button
              key={track.id}
              type="button"
              className="shrink-0 transition-transform hover:scale-105"
              aria-label={track.name}
            >
              <img
                src={track.imageUrl}
                alt={track.name}
                className="size-12 rounded-full object-cover ring-2 ring-[#00E5FF]/30"
              />
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-5">
        <h2 className="mb-4 text-sm font-semibold text-[#F8FAFC]">
          Artistas que deverias seguir
        </h2>

        <ul className="space-y-4">
          {suggestedArtists.map((artist) => {
            const isFollowing = following[artist.id]

            return (
              <li key={artist.id} className="flex items-center gap-3">
                <img
                  src={artist.imageUrl}
                  alt={artist.name}
                  className="size-11 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#F8FAFC]">
                    {artist.name}
                  </p>
                  <p className="truncate text-xs text-[#94A3B8]">
                    {artist.followers}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFollow(artist.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isFollowing
                      ? 'border border-[#00E5FF]/40 bg-transparent text-[#00E5FF]'
                      : 'bg-[#00E5FF] text-black hover:bg-[#00E5FF]/90'
                  }`}
                >
                  {isFollowing ? 'A seguir' : 'Seguir'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
