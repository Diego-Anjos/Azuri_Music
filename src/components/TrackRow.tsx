import {
  Disc,
  FolderPlus,
  Heart,
  ListPlus,
  MessageSquare,
  MoreHorizontal,
  Play,
  Radio,
  Send,
  Share2,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { AddToPlaylistModal } from './AddToPlaylistModal'
import { AzuriToast } from './AzuriToast'
import { ShareModal } from './ShareModal'
import { TrackWaveform } from './TrackWaveform'
import {
  usePlayerStore,
  type PlayerTrack,
} from '../store/usePlayerStore'

const ICON_STROKE = 1.5

export type TrackRowTrack = PlayerTrack & {
  album?: {
    id?: string
    name?: string
    release_date?: string
    images?: Array<{ url: string }> | null
  } | null
}

type TrackComment = {
  id: string
  text: string
  timestampSec: number
  createdAt: number
}

type TrackRowProps = {
  track: TrackRowTrack
  index: number
  onPlay: () => void
  /** featured = Artist (capa + waveform larga); compact = Album */
  variant?: 'featured' | 'compact'
  artistsFallback?: string
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatTimestamp(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function commentsStorageKey(trackId: string) {
  return `azuri_comments_${trackId}`
}

function likedStorageKey(trackId: string) {
  return `azuri_liked_${trackId}`
}

function loadComments(trackId: string): TrackComment[] {
  try {
    const raw = localStorage.getItem(commentsStorageKey(trackId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as TrackComment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveComments(trackId: string, comments: TrackComment[]) {
  localStorage.setItem(commentsStorageKey(trackId), JSON.stringify(comments))
}

function loadLiked(trackId: string) {
  return localStorage.getItem(likedStorageKey(trackId)) === '1'
}

function saveLiked(trackId: string, liked: boolean) {
  if (liked) localStorage.setItem(likedStorageKey(trackId), '1')
  else localStorage.removeItem(likedStorageKey(trackId))
}

const actionBtnClass =
  'p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-white/5 transition-all'

export function TrackRow({
  track,
  index,
  onPlay,
  variant = 'featured',
  artistsFallback,
}: TrackRowProps) {
  const navigate = useNavigate()
  const menuId = useId()
  const playNext = usePlayerStore((s) => s.playNext)
  const startTrackStation = usePlayerStore((s) => s.startTrackStation)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const progress = usePlayerStore((s) => s.progress)

  const [liked, setLiked] = useState(() => loadLiked(track.id))
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<TrackComment[]>(() =>
    loadComments(track.id),
  )
  const [commentDraft, setCommentDraft] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)

  const isCurrent = currentTrack?.id === track.id
  const isCompact = variant === 'compact'
  const coverUrl = track.album?.images?.[0]?.url
  const artistsLabel =
    track.artists?.map((a) => a.name).join(', ') || artistsFallback || '—'
  const artistId = track.artists?.[0]?.id
  const albumId = track.album?.id
  const shareUrl =
    typeof window !== 'undefined'
      ? albumId
        ? `${window.location.origin}/album/${albumId}?track=${track.id}`
        : artistId
          ? `${window.location.origin}/artist/${artistId}?track=${track.id}`
          : `${window.location.origin}${window.location.pathname}?track=${track.id}`
      : ''

  useEffect(() => {
    setLiked(loadLiked(track.id))
    setComments(loadComments(track.id))
    setCommentsOpen(false)
    setCommentDraft('')
    setMenuOpen(false)
    setShareOpen(false)
  }, [track.id])

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlay()
    }
  }

  function toggleLike(event: MouseEvent) {
    event.stopPropagation()
    setLiked((prev) => {
      const next = !prev
      saveLiked(track.id, next)
      return next
    })
  }

  function toggleComments(event: MouseEvent) {
    event.stopPropagation()
    setCommentsOpen((prev) => !prev)
    setMenuOpen(false)
  }

  function handleShare(event: MouseEvent) {
    event.stopPropagation()
    setMenuOpen(false)
    setShareOpen(true)
  }

  function handleSubmitComment(event?: MouseEvent) {
    event?.stopPropagation()
    const text = commentDraft.trim()
    if (!text) return

    const timestampSec =
      isCurrent && typeof progress === 'number' ? Math.max(0, progress) : 0

    const next: TrackComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      timestampSec,
      createdAt: Date.now(),
    }

    const updated = [...comments, next]
    setComments(updated)
    saveComments(track.id, updated)
    setCommentDraft('')
  }

  function handlePlayNext(event: MouseEvent) {
    event.stopPropagation()
    void playNext(track)
    setMenuOpen(false)
    setToast('Adicionada para tocar a seguir')
  }

  function handleAddToPlaylist(event: MouseEvent) {
    event.stopPropagation()
    setMenuOpen(false)
    setPlaylistModalOpen(true)
  }

  function handleGoToAlbum(event: MouseEvent) {
    event.stopPropagation()
    const albumId = track.album?.id
    if (albumId) navigate(`/album/${albumId}`)
    setMenuOpen(false)
  }

  function handleTrackStation(event: MouseEvent) {
    event.stopPropagation()
    setMenuOpen(false)
    setToast(`Iniciando estação de ${track.name}...`)
    void startTrackStation(track)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={handleRowKeyDown}
      className={`group flex cursor-pointer flex-col rounded-xl border transition-colors ${
        isCompact ? 'gap-0 px-4 py-2.5' : 'p-4'
      } ${
        isCurrent
          ? 'border-cyan-500/20 bg-[#111827]'
          : 'border-transparent bg-transparent hover:border-white/5 hover:bg-[#111827]'
      }`}
    >
      {/* LINHA SUPERIOR */}
      <div
        className={`flex ${isCompact ? 'items-center gap-3' : 'items-start gap-4'}`}
      >
        <div
          className={`relative flex shrink-0 items-center justify-center ${
            isCompact ? 'h-7 w-7' : 'mt-1 w-8'
          }`}
        >
          <span
            className={`absolute font-mono transition-opacity group-hover:opacity-0 ${
              isCompact ? 'text-sm' : ''
            } ${isCurrent ? 'text-cyan-400' : 'text-gray-500'}`}
          >
            {index + 1}
          </span>
          <button
            type="button"
            className={`relative z-10 flex items-center justify-center rounded-full bg-cyan-400 text-black opacity-0 transition-opacity group-hover:opacity-100 ${
              isCompact ? 'h-7 w-7' : 'h-8 w-8'
            }`}
            onClick={(event) => {
              event.stopPropagation()
              onPlay()
            }}
            aria-label={`Tocar ${track.name}`}
          >
            <Play
              className={`ml-0.5 fill-current ${isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
              strokeWidth={ICON_STROKE}
            />
          </button>
        </div>

        {!isCompact &&
          (coverUrl ? (
            <img
              src={coverUrl}
              alt={track.name}
              className="h-12 w-12 rounded-md object-cover shadow-md"
            />
          ) : (
            <div className="h-12 w-12 rounded-md bg-[#0B0F19] shadow-md" />
          ))}

        <div
          className={`flex min-w-0 flex-1 ${
            isCompact
              ? 'items-center justify-between gap-3'
              : 'items-start justify-between gap-3'
          }`}
        >
          <div className="flex min-w-0 flex-col">
            <span
              className={`line-clamp-1 font-medium transition-colors group-hover:text-cyan-400 ${
                isCompact ? 'text-sm' : 'text-base'
              } ${isCurrent ? 'text-cyan-400' : 'text-white'}`}
            >
              {track.name}
            </span>
            <span
              className={`truncate text-gray-400 ${isCompact ? 'text-xs' : 'text-sm'}`}
            >
              {artistsLabel}
            </span>
          </div>

          <div
            className={`flex shrink-0 items-center gap-2 ${isCompact ? '' : 'mt-1'}`}
          >
            <button
              type="button"
              className={`${actionBtnClass} ${
                liked
                  ? 'text-cyan-400 opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
              onClick={toggleLike}
              aria-label={liked ? 'Remover curtida' : 'Curtir faixa'}
              aria-pressed={liked}
            >
              <Heart
                className={`h-4 w-4 ${liked ? 'fill-cyan-400 text-cyan-400' : ''}`}
                strokeWidth={ICON_STROKE}
              />
            </button>

            <button
              type="button"
              className={`${actionBtnClass} flex items-center opacity-0 group-hover:opacity-100 ${
                commentsOpen ? 'text-cyan-400 opacity-100' : ''
              }`}
              onClick={toggleComments}
              aria-label="Comentários"
              aria-expanded={commentsOpen}
            >
              <MessageSquare className="h-4 w-4" strokeWidth={ICON_STROKE} />
              {comments.length > 0 && (
                <span className="ml-1 font-mono text-xs">{comments.length}</span>
              )}
            </button>

            <button
              type="button"
              className={`${actionBtnClass} opacity-0 group-hover:opacity-100 ${
                shareOpen ? 'text-cyan-400 opacity-100' : ''
              }`}
              onClick={handleShare}
              aria-label="Compartilhar"
            >
              <Share2 className="h-4 w-4" strokeWidth={ICON_STROKE} />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className={`${actionBtnClass} opacity-0 group-hover:opacity-100 ${
                  menuOpen ? 'text-cyan-400 opacity-100' : ''
                }`}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen((prev) => !prev)
                }}
                aria-label="Mais opções"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={ICON_STROKE} />
              </button>

              {menuOpen && (
                <div
                  id={menuId}
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-white/10 bg-[#0F172A]/95 py-1.5 shadow-2xl backdrop-blur-xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-cyan-400"
                    onClick={handlePlayNext}
                  >
                    <ListPlus className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} />
                    Tocar a seguir
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-cyan-400"
                    onClick={handleAddToPlaylist}
                  >
                    <FolderPlus className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} />
                    Adicionar à Playlist
                  </button>
                  {track.album?.id && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-cyan-400"
                      onClick={handleGoToAlbum}
                    >
                      <Disc className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} />
                      Ir para o Álbum
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-cyan-400"
                    onClick={handleTrackStation}
                  >
                    <Radio className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} />
                    Estação da Faixa
                  </button>
                </div>
              )}
            </div>

            <span
              className={`font-mono text-gray-500 ${
                isCompact ? 'w-10 text-right text-xs' : 'text-sm'
              }`}
            >
              {formatDuration(track.duration_ms ?? 0)}
            </span>
          </div>
        </div>
      </div>

      {/* WAVEFORM */}
      <TrackWaveform
        trackId={track.id}
        trackName={track.name}
        durationMs={track.duration_ms ?? 0}
        barCount={65}
        variant={isCompact ? 'compact' : 'featured'}
        className={
          isCompact ? 'mt-1.5 h-4 pl-10' : 'mt-3 h-10 pl-[3.25rem]'
        }
      />

      {/* GAVETA DE COMENTÁRIOS */}
      {commentsOpen && (
        <div
          className="mt-3 border-t border-white/5 pt-3"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center gap-2">
            <input
              type="text"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSubmitComment()
                }
              }}
              placeholder="Escreva um comentário sobre esta faixa..."
              className="flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-1.5 text-sm text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={handleSubmitComment}
              disabled={!commentDraft.trim()}
              className="rounded-full bg-cyan-400 p-2 text-black transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              aria-label="Enviar comentário"
            >
              <Send className="h-4 w-4" strokeWidth={ICON_STROKE} />
            </button>
          </div>

          {comments.length > 0 ? (
            <ul className="flex max-h-48 flex-col gap-2.5 overflow-y-auto pr-1">
              {[...comments].reverse().map((comment) => (
                <li key={comment.id} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/20 text-xs font-bold text-cyan-400">
                    V
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-white">Você</span>
                      <span className="font-mono text-[11px] text-gray-500">
                        em {formatTimestamp(comment.timestampSec)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm leading-snug text-gray-300">
                      {comment.text}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">
              Seja o primeiro a comentar esta faixa.
            </p>
          )}
        </div>
      )}

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={track.name}
        artist={artistsLabel}
        coverUrl={coverUrl}
        shareUrl={shareUrl}
      />

      <AddToPlaylistModal
        open={playlistModalOpen}
        track={track}
        onClose={() => setPlaylistModalOpen(false)}
        onAdded={(playlistName) =>
          setToast(`Adicionada a "${playlistName}"`)
        }
      />

      <AzuriToast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}
