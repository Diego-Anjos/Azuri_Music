import {
  ChevronUp,
  Heart,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Smile,
  Volume2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactPlayer from 'react-player/youtube'
import { usePlayerStore } from '../../store/usePlayerStore'

const ICON_STROKE = 1.5

const REACTION_EMOJIS = ['🔥', '🚀', '🎵', '💙', '🤯'] as const

const WAVEFORM_FILL = {
  backgroundImage:
    'repeating-linear-gradient(90deg, #22d3ee, #22d3ee 3px, transparent 3px, transparent 6px)',
  backgroundColor: 'rgba(34, 211, 238, 0.25)',
} as const

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function MusicPlayer() {
  const {
    isPlaying,
    volume,
    currentTrack,
    youtubeVideoId,
    progress,
    duration,
    togglePlay,
    setVolume,
    setProgress,
    setDuration,
    handleNextTrack,
  } = usePlayerStore()
  const [liked, setLiked] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [reactionToast, setReactionToast] = useState<string | null>(null)
  const [floatingEmojis, setFloatingEmojis] = useState<
    { id: number; emoji: string }[]
  >([])
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)

  const title = currentTrack?.name ?? 'Nenhuma música'
  const artist =
    currentTrack?.artists?.[0]?.name ?? 'Selecione uma faixa'
  const coverUrl = currentTrack?.album?.images?.[0]?.url
  const albumName = currentTrack?.album?.name
  const releaseDate = currentTrack?.album?.release_date
  const progressPercent = Math.min(100, Math.max(0, progress * 100))
  const elapsedSeconds = duration > 0 ? progress * duration : 0
  const volumePercent = Math.round(volume * 100)

  useEffect(() => {
    if (!reactionToast) return
    const timer = window.setTimeout(() => setReactionToast(null), 2000)
    return () => window.clearTimeout(timer)
  }, [reactionToast])

  function handleReaction(emoji: string) {
    setReactionToast(`Você reagiu com ${emoji}`)
    setShowReactions(false)

    const id = Date.now()
    setFloatingEmojis((prev) => [...prev, { id, emoji }])
    window.setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id))
    }, 1000)
  }

  return (
    <footer className="relative z-30 flex h-24 shrink-0 items-center justify-between gap-4 border-t border-gray-800 bg-[#0B0F19]/90 px-4 backdrop-blur-md md:px-6">
      <ReactPlayer
        url={
          youtubeVideoId
            ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
            : undefined
        }
        playing={isPlaying}
        volume={volume}
        onProgress={(state) => setProgress(state.played)}
        onDuration={(dur) => setDuration(dur)}
        onEnded={handleNextTrack}
        width="0"
        height="0"
        className="hidden"
      />

      {/* Esquerda — faixa + Now Playing */}
      <div className="relative flex min-w-0 flex-1 items-center gap-3">
        <div
          className={`absolute bottom-full left-0 z-40 mb-2 w-80 origin-bottom transform rounded-xl border border-gray-800 bg-[#0B0F19]/95 p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
            isExpanded
              ? 'pointer-events-auto scale-y-100 opacity-100'
              : 'pointer-events-none scale-y-0 opacity-0'
          }`}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="mb-4 aspect-square w-full rounded-lg object-cover shadow-lg"
            />
          ) : (
            <div className="mb-4 flex aspect-square w-full items-center justify-center rounded-lg bg-white/10 text-sm text-[#94A3B8] shadow-lg">
              Sem capa
            </div>
          )}
          <h3 className="truncate text-lg font-bold text-white">{title}</h3>
          <p className="mb-4 text-sm text-cyan-400">{artist}</p>
          <div className="space-y-2 border-t border-white/10 pt-3 text-xs">
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[#94A3B8]">Álbum</span>
              <span className="truncate text-right text-[#F8FAFC]">
                {albumName ?? '—'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[#94A3B8]">Lançamento</span>
              <span className="truncate text-right text-[#F8FAFC]">
                {releaseDate ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="h-14 w-14 shrink-0 rounded-md object-cover shadow-lg shadow-black/40"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-md bg-white/10" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#F8FAFC] transition-colors hover:text-cyan-400">
            {title}
          </p>
          <p className="truncate text-xs text-[#94A3B8]">{artist}</p>
        </div>
        <button
          type="button"
          onClick={() => setLiked((prev) => !prev)}
          aria-label={liked ? 'Remover dos favoritos' : 'Favoritar'}
          className={`shrink-0 transition-colors duration-200 ${
            liked
              ? 'text-cyan-400'
              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <Heart
            className="size-5"
            strokeWidth={ICON_STROKE}
            fill={liked ? 'currentColor' : 'none'}
          />
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Recolher Now Playing' : 'Expandir Now Playing'}
          aria-expanded={isExpanded}
          className={`cursor-pointer text-gray-400 transition-transform hover:text-white ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronUp className="size-5" strokeWidth={ICON_STROKE} />
        </button>
      </div>

      {/* Centro — controles + progresso estilo SoundCloud */}
      <div className="flex max-w-xl flex-[1.4] flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Aleatório"
            aria-pressed={shuffle}
            onClick={() => setShuffle((prev) => !prev)}
            className={`transition-colors duration-200 ${
              shuffle
                ? 'text-cyan-400'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Shuffle className="size-4" strokeWidth={ICON_STROKE} />
          </button>

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
            disabled={!youtubeVideoId}
            className="flex size-12 items-center justify-center rounded-full bg-cyan-400 text-gray-900 shadow-[0_0_20px_rgba(34,211,238,0.35)] transition-transform duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isPlaying ? (
              <Pause
                className="size-5"
                strokeWidth={ICON_STROKE}
                fill="currentColor"
              />
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
            onClick={handleNextTrack}
            className="text-[#94A3B8] transition-colors duration-200 hover:text-[#F8FAFC]"
          >
            <SkipForward className="size-5" strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            aria-label="Repetir"
            aria-pressed={repeat}
            onClick={() => setRepeat((prev) => !prev)}
            className={`transition-colors duration-200 ${
              repeat
                ? 'text-cyan-400'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Repeat className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <div className="flex w-full items-center gap-2.5">
          <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-[#94A3B8]">
            {formatTime(elapsedSeconds)}
          </span>
          <div className="group relative h-5 flex-1 cursor-pointer overflow-hidden rounded-md bg-white/10 transition-transform hover:scale-y-110 sm:h-6">
            <div
              className="absolute inset-y-0 left-0 rounded-md"
              style={{
                width: `${progressPercent}%`,
                ...WAVEFORM_FILL,
              }}
            />
          </div>
          <span className="w-9 shrink-0 text-[10px] tabular-nums text-[#94A3B8]">
            {formatTime(duration)}
          </span>

          <div className="relative ml-3 flex items-center">
            <button
              type="button"
              onClick={() => setShowReactions(!showReactions)}
              aria-label="Reagir"
              aria-expanded={showReactions}
              className="cursor-pointer text-gray-400 transition-all hover:scale-110 hover:text-cyan-400"
            >
              <Smile className="size-5" strokeWidth={ICON_STROKE} />
            </button>

            {floatingEmojis.map((item) => (
              <div
                key={item.id}
                className="pointer-events-none absolute right-0 bottom-6 z-50 animate-float-up select-none text-3xl drop-shadow-lg"
              >
                {item.emoji}
              </div>
            ))}

            {showReactions && (
              <div className="absolute right-[-10px] bottom-8 flex animate-in fade-in slide-in-from-bottom-2 gap-2 rounded-full border border-gray-700 bg-[#0B0F19]/95 p-2 shadow-lg shadow-cyan-500/20 backdrop-blur-md">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleReaction(emoji)}
                    aria-label={`Reagir com ${emoji}`}
                    className="cursor-pointer text-xl transition-all hover:-translate-y-1 hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {reactionToast && (
          <p className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-full border border-cyan-400/30 bg-[#0B0F19]/95 px-3 py-1 text-xs text-[#F8FAFC] shadow-lg backdrop-blur-md">
            {reactionToast}
          </p>
        )}
      </div>

      {/* Direita — volume */}
      <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
        <Volume2
          className="size-4 shrink-0 text-[#94A3B8]"
          strokeWidth={ICON_STROKE}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={volumePercent}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          aria-label="Volume"
          style={{
            background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${volumePercent}%, rgba(255,255,255,0.15) ${volumePercent}%, rgba(255,255,255,0.15) 100%)`,
          }}
          className="h-1.5 w-28 cursor-pointer appearance-none rounded-full outline-none [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(34,211,238,0.6)]"
        />
      </div>
    </footer>
  )
}
