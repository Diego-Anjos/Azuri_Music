import {
  Heart,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react'
import { useState } from 'react'
import { usePlayerStore } from '../../store/usePlayerStore'

const ICON_STROKE = 1.5

export function MusicPlayer() {
  const { isPlaying, volume, currentTrack, togglePlay, setVolume } =
    usePlayerStore()
  const [liked, setLiked] = useState(false)

  const title = currentTrack?.title ?? 'Nenhuma música'
  const artist = currentTrack?.artist ?? 'Selecione uma faixa'
  const coverUrl = currentTrack?.coverUrl

  return (
    <footer className="flex h-24 shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-[#111827] px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="size-14 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="size-14 shrink-0 rounded bg-white/10" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#F8FAFC]">{title}</p>
          <p className="truncate text-xs text-[#94A3B8]">{artist}</p>
        </div>
        <button
          type="button"
          onClick={() => setLiked((prev) => !prev)}
          aria-label={liked ? 'Remover dos favoritos' : 'Favoritar'}
          className={`shrink-0 transition-colors duration-200 ${
            liked
              ? 'text-[#00E5FF]'
              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <Heart
            className="size-5"
            strokeWidth={ICON_STROKE}
            fill={liked ? 'currentColor' : 'none'}
          />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center gap-5">
        <button
          type="button"
          aria-label="Faixa anterior"
          className="text-[#94A3B8] transition-colors duration-200 hover:text-[#F8FAFC]"
        >
          <SkipBack className="size-5" strokeWidth={ICON_STROKE} />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
          className="flex size-11 items-center justify-center rounded-full bg-[#00E5FF] text-black transition-transform duration-200 hover:scale-105"
        >
          {isPlaying ? (
            <Pause className="size-5" strokeWidth={ICON_STROKE} fill="currentColor" />
          ) : (
            <Play
              className="size-5 translate-x-px"
              strokeWidth={ICON_STROKE}
              fill="currentColor"
            />
          )}
        </button>

        <button
          type="button"
          aria-label="Próxima faixa"
          className="text-[#94A3B8] transition-colors duration-200 hover:text-[#F8FAFC]"
        >
          <SkipForward className="size-5" strokeWidth={ICON_STROKE} />
        </button>
      </div>

      <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
        <Volume2
          className="size-4 shrink-0 text-[#94A3B8]"
          strokeWidth={ICON_STROKE}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/20 accent-[#00E5FF] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00E5FF]"
        />
      </div>
    </footer>
  )
}
