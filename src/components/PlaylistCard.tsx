import { Play, Plus } from 'lucide-react'
import type { SpotifyPlaylist } from '../services/spotify'

type PlaylistCardProps = Pick<
  SpotifyPlaylist,
  'name' | 'description' | 'imageUrl'
>

const ICON_STROKE = 1.5

export function PlaylistCard({
  name,
  description,
  imageUrl,
}: PlaylistCardProps) {
  return (
    <article className="group cursor-pointer rounded-lg bg-white/5 p-3 transition-colors duration-300 hover:bg-white/10">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-md bg-[#111827] shadow-lg shadow-black/30 transition-shadow duration-300 group-hover:shadow-[#00E5FF]/20">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#94A3B8]">
            Sem capa
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[#00E5FF]/0 transition-colors duration-300 group-hover:bg-[#00E5FF]/10" />

        <div className="absolute bottom-2 right-2 flex translate-y-2 gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Adicionar à biblioteca"
            onClick={(e) => e.preventDefault()}
            className="flex size-9 items-center justify-center rounded-full bg-[#111827]/90 text-[#94A3B8] transition-colors hover:text-[#F8FAFC]"
          >
            <Plus className="size-4" strokeWidth={ICON_STROKE} />
          </button>
          <button
            type="button"
            aria-label={`Reproduzir ${name}`}
            onClick={(e) => e.preventDefault()}
            className="flex size-9 items-center justify-center rounded-full bg-[#00E5FF] text-black transition-transform hover:scale-105"
          >
            <Play
              className="size-4 translate-x-px"
              strokeWidth={ICON_STROKE}
              fill="currentColor"
            />
          </button>
        </div>
      </div>
      <h4 className="truncate text-sm font-semibold text-[#F8FAFC]">{name}</h4>
      <p className="mt-1 truncate text-xs text-[#94A3B8]">{description}</p>
    </article>
  )
}
