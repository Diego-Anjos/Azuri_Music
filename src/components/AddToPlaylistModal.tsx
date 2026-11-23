import { ListMusic, Plus, X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  addTrackToPlaylist,
  createPlaylist,
  getPlaylists,
  subscribeLibraryUpdates,
  type LibraryTrack,
  type UserPlaylist,
} from '../services/libraryStorage'

const ICON_STROKE = 1.5

type AddToPlaylistModalProps = {
  open: boolean
  track: LibraryTrack
  onClose: () => void
  onAdded?: (playlistName: string) => void
}

export function AddToPlaylistModal({
  open,
  track,
  onClose,
  onAdded,
}: AddToPlaylistModalProps) {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() => getPlaylists())
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (!open) return
    setPlaylists(getPlaylists())
    setNewName('')

    return subscribeLibraryUpdates(() => {
      setPlaylists(getPlaylists())
    })
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  function refresh() {
    setPlaylists(getPlaylists())
  }

  function handleAdd(playlist: UserPlaylist, event: MouseEvent) {
    event.stopPropagation()
    addTrackToPlaylist(playlist.id, track)
    onAdded?.(playlist.name)
    refresh()
    onClose()
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    const trimmed = newName.trim()
    if (!trimmed) return

    const playlist = createPlaylist(trimmed)
    addTrackToPlaylist(playlist.id, track)
    onAdded?.(playlist.name)
    setNewName('')
    refresh()
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="azuri-add-playlist-title"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111827] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="azuri-add-playlist-title"
            className="text-base font-bold text-white"
          >
            Adicionar à Playlist
          </h2>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <p className="mb-3 truncate text-xs text-gray-400">{track.name}</p>

        <form onSubmit={handleCreate} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nova playlist..."
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
            Criar
          </button>
        </form>

        <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                onClick={(event) => handleAdd(playlist, event)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
              >
                {playlist.coverUrl ? (
                  <img
                    src={playlist.coverUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/5 text-cyan-400">
                    <ListMusic className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {playlist.name}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {playlist.tracks.length}{' '}
                    {playlist.tracks.length === 1 ? 'faixa' : 'faixas'}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
