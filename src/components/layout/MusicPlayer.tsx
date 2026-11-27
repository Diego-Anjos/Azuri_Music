import {
  ChevronUp,
  Clapperboard,
  Heart,
  Mic2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Smile,
  Volume2,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react'
import ReactPlayer from 'react-player/youtube'
import { Link, useNavigate } from 'react-router-dom'
import {
  PlayerProvider,
  usePlayerAudio,
} from '../../contexts/PlayerContext'
import { useExternalPiP } from '../../hooks/useExternalPiP'
import {
  getAudioSettings,
  getQualityBadgeLabel,
  isStreamProxyUrl,
  subscribeAudioSettings,
  type AudioSettings,
} from '../../services/audioSettingsService'
import {
  isTrackLiked,
  toggleLikedTrack,
} from '../../services/libraryStorage'
import { usePlayerStore } from '../../store/usePlayerStore'
import { TrackWaveform } from '../TrackWaveform'

const ARTIST_LINK_CLASS =
  'cursor-pointer text-sm text-gray-400 transition-colors hover:text-cyan-400 hover:underline'

const ICON_STROKE = 1.5

const REACTION_EMOJIS = ['🔥', '🚀', '🎵', '💙', '🤯'] as const

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getCrossfadeMultiplier(
  progressRatio: number,
  durationSeconds: number,
  crossfadeSeconds: number,
): number {
  if (crossfadeSeconds <= 0 || durationSeconds <= 0) return 1
  const remaining = (1 - progressRatio) * durationSeconds
  const elapsed = progressRatio * durationSeconds
  const fadeOut =
    remaining < crossfadeSeconds
      ? Math.max(0.05, remaining / crossfadeSeconds)
      : 1
  const fadeIn =
    elapsed < Math.min(crossfadeSeconds, durationSeconds / 2)
      ? Math.max(0.05, elapsed / Math.min(crossfadeSeconds, durationSeconds / 2))
      : 1
  return Math.min(fadeOut, fadeIn)
}

function MusicPlayerInner({
  audioRef,
}: {
  audioRef: RefObject<HTMLAudioElement | null>
}) {
  const navigate = useNavigate()
  const { resumeAudioContext, markExternalFallback } = usePlayerAudio()
  const {
    isPlaying,
    volume,
    currentTrack,
    youtubeVideoId,
    localAudioUrl,
    progress,
    duration,
    seekRequest,
    togglePlay,
    setVolume,
    setProgress,
    setDuration,
    clearSeekRequest,
    handleNextTrack,
    playPrevious,
    isLyricsOpen,
    toggleLyrics,
    seekTo,
    fallbackToYoutube,
    refreshStreamQuality,
    isVideoMode,
    toggleVideoMode,
    repeatMode,
    toggleRepeat,
  } = usePlayerStore()
  const {
    isOpen: isExternalPipOpen,
    isSupported: isExternalPipSupported,
    toggle: toggleExternalPip,
  } = useExternalPiP()
  const playerRef = useRef<ReactPlayer | null>(null)
  const [liked, setLiked] = useState(false)
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    getAudioSettings(),
  )

  useEffect(() => {
    setLiked(currentTrack ? isTrackLiked(currentTrack.id) : false)
  }, [currentTrack])

  useEffect(() => {
    return subscribeAudioSettings(() => {
      const next = getAudioSettings()
      setAudioSettings((prev) => {
        if (prev.quality !== next.quality) {
          refreshStreamQuality()
        }
        return next
      })
    })
  }, [refreshStreamQuality])

  const [isExpanded, setIsExpanded] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [reactionToast, setReactionToast] = useState<string | null>(null)
  const [floatingEmojis, setFloatingEmojis] = useState<
    { id: number; emoji: string }[]
  >([])
  const [shuffle, setShuffle] = useState(false)

  const title = currentTrack?.name ?? 'Nenhuma música'
  const artists = currentTrack?.artists ?? []
  const coverUrl = currentTrack?.album?.images?.[0]?.url
  const albumName = currentTrack?.album?.name
  const releaseDate = currentTrack?.album?.release_date
  const elapsedSeconds = duration > 0 ? progress * duration : 0
  const volumePercent = Math.round(volume * 100)
  const usingLocalAudio = Boolean(localAudioUrl)
  const canPlay = Boolean(youtubeVideoId || localAudioUrl)
  const qualityBadge = getQualityBadgeLabel(audioSettings)
  const needsCors =
    Boolean(localAudioUrl) &&
    (/^https?:\/\//i.test(localAudioUrl ?? '') ||
      isStreamProxyUrl(localAudioUrl))
  const effectiveVolume =
    volume *
    getCrossfadeMultiplier(
      progress,
      duration,
      audioSettings.crossfadeSeconds,
    )

  useEffect(() => {
    if (seekRequest == null) return
    // No Modo Vídeo o seek é aplicado pelo VideoStageView
    if (isVideoMode) return

    if (usingLocalAudio && audioRef.current) {
      const dur = audioRef.current.duration
      if (Number.isFinite(dur) && dur > 0) {
        audioRef.current.currentTime = seekRequest * dur
      }
      clearSeekRequest()
      return
    }

    if (!playerRef.current) return
    playerRef.current.seekTo(seekRequest, 'fraction')
    clearSeekRequest()
  }, [seekRequest, clearSeekRequest, usingLocalAudio, isVideoMode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !usingLocalAudio) return

    audio.volume = Math.min(1, Math.max(0, effectiveVolume))

    // Modo Vídeo: silencia o <audio> nativo para não duplicar o som
    if (isVideoMode) {
      audio.pause()
      return
    }

    if (isPlaying) {
      void resumeAudioContext().then(() =>
        audio.play().catch(() => {
          usePlayerStore.setState({ isPlaying: false })
        }),
      )
    } else {
      audio.pause()
    }
  }, [
    isPlaying,
    isVideoMode,
    effectiveVolume,
    usingLocalAudio,
    localAudioUrl,
    resumeAudioContext,
  ])

  useEffect(() => {
    if (youtubeVideoId && !localAudioUrl) {
      markExternalFallback()
    }
  }, [youtubeVideoId, localAudioUrl, markExternalFallback])

  function renderArtistLinks(options?: {
    onNavigate?: () => void
    className?: string
  }) {
    if (artists.length === 0) {
      return (
        <span className={options?.className ?? 'text-sm text-gray-400'}>
          Selecione uma faixa
        </span>
      )
    }

    return artists.map((artist, index) => (
      <span key={`${artist.id ?? artist.name}-${index}`}>
        {index > 0 && (
          <span className={options?.className ?? 'text-sm text-gray-400'}>, </span>
        )}
        {artist.id ? (
          <Link
            to={`/artist/${artist.id}`}
            state={{ artistName: artist.name }}
            onClick={options?.onNavigate}
            className={options?.className ?? ARTIST_LINK_CLASS}
          >
            {artist.name}
          </Link>
        ) : (
          <span className={options?.className ?? 'text-sm text-gray-400'}>
            {artist.name}
          </span>
        )}
      </span>
    ))
  }

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

  function handleToggleLike() {
    if (!currentTrack) return
    setLiked(toggleLikedTrack(currentTrack))
  }

  function handleProgressBarClick(event: MouseEvent<HTMLDivElement>) {
    if (!currentTrack) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    )
    seekTo(ratio)
  }

  function handleTogglePlay() {
    void resumeAudioContext()
    togglePlay()
  }

  async function handleAudioError() {
    markExternalFallback()
    await fallbackToYoutube()
  }

  // <audio> permanece montado (estável para MediaElementSource / StrictMode).
  const mediaElements = (
    <>
      <audio
        ref={audioRef}
        crossOrigin={needsCors ? 'anonymous' : undefined}
        src={usingLocalAudio ? (localAudioUrl ?? undefined) : undefined}
        preload="auto"
        className="hidden"
        onTimeUpdate={(event) => {
          if (!usingLocalAudio || isVideoMode) return
          const el = event.currentTarget
          if (!Number.isFinite(el.duration) || el.duration <= 0) return
          setProgress(el.currentTime / el.duration)
        }}
        onLoadedMetadata={(event) => {
          if (!usingLocalAudio) return
          const el = event.currentTarget
          if (Number.isFinite(el.duration)) setDuration(el.duration)
        }}
        onEnded={() => {
          if (!usingLocalAudio || isVideoMode) return
          void handleNextTrack()
        }}
        onError={() => {
          if (!usingLocalAudio || isVideoMode) return
          void handleAudioError()
        }}
      />
      {!usingLocalAudio && youtubeVideoId && !isVideoMode ? (
        <ReactPlayer
          ref={playerRef}
          url={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
          playing={isPlaying}
          volume={effectiveVolume}
          onProgress={(state) => setProgress(state.played)}
          onDuration={(dur) => setDuration(dur)}
          onEnded={handleNextTrack}
          width="0"
          height="0"
          className="hidden"
          progressInterval={200}
        />
      ) : null}
    </>
  )

  return (
    <footer className="fixed inset-x-0 bottom-14 z-40 h-16 border-t border-white/10 bg-[#0B0F19]/95 px-3 backdrop-blur-xl md:bottom-0 md:h-20 md:px-6">
      {mediaElements}

      {/* Mobile progress bar */}
      <div
        role="slider"
        aria-label="Progresso da faixa"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        onClick={handleProgressBarClick}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') seekTo(Math.min(1, progress + 0.02))
          if (event.key === 'ArrowLeft') seekTo(Math.max(0, progress - 0.02))
        }}
        className="absolute top-0 right-0 left-0 h-1 cursor-pointer bg-white/10 md:hidden"
      >
        <div
          className="h-full bg-cyan-400 transition-[width] duration-150"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      {/* ——— Mobile layout ——— */}
      <div className="flex h-full items-center justify-between gap-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
          )}
          <div className="min-w-0 max-w-[140px] sm:max-w-[220px]">
            <p className="truncate text-sm font-medium text-[#F8FAFC]">{title}</p>
            <p className="truncate text-xs text-[#94A3B8]">
              {renderArtistLinks({
                className: 'text-xs text-[#94A3B8]',
              })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            title="Modo Vídeo"
            aria-label="Modo Vídeo"
            aria-pressed={isVideoMode}
            onClick={() => void toggleVideoMode()}
            disabled={!currentTrack}
            className={`rounded-full p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isVideoMode
                ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Clapperboard className="size-5" strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            title="Letras"
            aria-label="Letras"
            aria-pressed={isLyricsOpen}
            onClick={toggleLyrics}
            disabled={!currentTrack}
            className={`rounded-full p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isLyricsOpen
                ? 'text-cyan-400'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Mic2 className="size-5" strokeWidth={ICON_STROKE} />
          </button>

          {isExternalPipSupported && (
            <button
              type="button"
              title="Janela Flutuante (Fora do Navegador)"
              aria-label="Janela Flutuante (Fora do Navegador)"
              aria-pressed={isExternalPipOpen}
              onClick={() => void toggleExternalPip()}
              disabled={!currentTrack}
              className={`rounded-full p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isExternalPipOpen
                  ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <PictureInPicture2 className="size-5" strokeWidth={ICON_STROKE} />
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleLike}
            disabled={!currentTrack}
            aria-label={liked ? 'Remover dos favoritos' : 'Favoritar'}
            className={`rounded-full p-2 transition-colors disabled:opacity-40 ${
              liked ? 'text-cyan-400' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
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
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
            disabled={!canPlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 text-[#0B0F19] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isPlaying ? (
              <Pause
                className="size-4"
                strokeWidth={ICON_STROKE}
                fill="currentColor"
              />
            ) : (
              <Play
                className="size-4 translate-x-px"
                strokeWidth={ICON_STROKE}
                fill="currentColor"
              />
            )}
          </button>
        </div>
      </div>

      {/* ——— Desktop layout ——— */}
      <div className="hidden h-full items-center justify-between gap-4 md:flex">
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
            <p className="mb-4 truncate">
              {renderArtistLinks({ onNavigate: () => setIsExpanded(false) })}
            </p>
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
            <p className="truncate">{renderArtistLinks()}</p>
          </div>
          <button
            type="button"
            onClick={handleToggleLike}
            aria-label={liked ? 'Remover dos favoritos' : 'Favoritar'}
            className={`shrink-0 transition-colors duration-200 ${
              liked ? 'text-cyan-400' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
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
            aria-label={
              isExpanded ? 'Recolher Now Playing' : 'Expandir Now Playing'
            }
            aria-expanded={isExpanded}
            className={`cursor-pointer text-gray-400 transition-transform hover:text-white ${
              isExpanded ? 'rotate-180' : ''
            }`}
          >
            <ChevronUp className="size-5" strokeWidth={ICON_STROKE} />
          </button>
        </div>

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
              onClick={() => void playPrevious()}
              className="cursor-pointer text-[#94A3B8] transition-transform transition-colors duration-200 hover:text-[#F8FAFC] active:scale-90"
            >
              <SkipBack className="size-5" strokeWidth={ICON_STROKE} />
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              disabled={!canPlay}
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
              aria-pressed={repeatMode === 'all'}
              onClick={toggleRepeat}
              className={`cursor-pointer transition-colors duration-200 ${
                repeatMode === 'all'
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
            <div className="group relative h-5 flex-1 overflow-hidden rounded-md bg-white/5 transition-transform hover:scale-y-110 sm:h-6">
              {currentTrack ? (
                <TrackWaveform
                  trackId={currentTrack.id}
                  trackName={currentTrack.name}
                  durationMs={currentTrack.duration_ms ?? duration * 1000}
                  barCount={72}
                  variant="player"
                  className="h-full"
                />
              ) : (
                <div className="h-full w-full rounded-md bg-white/10" />
              )}
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

        <div className="flex flex-1 items-center justify-end gap-3">
          <button
            type="button"
            title="Modo Vídeo"
            aria-label="Modo Vídeo"
            aria-pressed={isVideoMode}
            onClick={() => void toggleVideoMode()}
            disabled={!currentTrack}
            className={`relative flex flex-col items-center gap-1 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
              isVideoMode
                ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.75)]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Clapperboard className="size-5" strokeWidth={ICON_STROKE} />
            {isVideoMode && (
              <span
                className="absolute -bottom-1 h-1 w-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]"
                aria-hidden
              />
            )}
          </button>

          <button
            type="button"
            title="Letras"
            aria-label="Letras"
            aria-pressed={isLyricsOpen}
            onClick={toggleLyrics}
            disabled={!currentTrack}
            className={`relative flex flex-col items-center gap-1 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
              isLyricsOpen
                ? 'text-cyan-400'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Mic2 className="size-5" strokeWidth={ICON_STROKE} />
            {isLyricsOpen && (
              <span
                className="absolute -bottom-1 h-1 w-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]"
                aria-hidden
              />
            )}
          </button>

          {isExternalPipSupported && (
            <button
              type="button"
              title="Janela Flutuante (Fora do Navegador)"
              aria-label="Janela Flutuante (Fora do Navegador)"
              aria-pressed={isExternalPipOpen}
              onClick={() => void toggleExternalPip()}
              disabled={!currentTrack}
              className={`relative flex flex-col items-center gap-1 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                isExternalPipOpen
                  ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.75)]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <PictureInPicture2 className="size-5" strokeWidth={ICON_STROKE} />
              {isExternalPipOpen && (
                <span
                  className="absolute -bottom-1 h-1 w-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]"
                  aria-hidden
                />
              )}
            </button>
          )}

          <div className="flex items-center gap-2">
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

          <button
            type="button"
            title="Configurações de áudio"
            aria-label={`Qualidade: ${qualityBadge}. Abrir configurações`}
            onClick={() => navigate('/settings')}
            className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-300 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:text-cyan-200"
          >
            {qualityBadge}
          </button>
        </div>
      </div>
    </footer>
  )
}

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const localAudioUrl = usePlayerStore((s) => s.localAudioUrl)

  return (
    <PlayerProvider audioRef={audioRef} streamUrl={localAudioUrl}>
      <MusicPlayerInner audioRef={audioRef} />
    </PlayerProvider>
  )
}
