import { Plus, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  PLAYLIST_COVER_THEMES,
  createPlaylist,
  type UserPlaylist,
} from '../services/libraryStorage'

const ICON_STROKE = 1.5

type CreatePlaylistModalProps = {
  open: boolean
  onClose: () => void
  onCreated?: (playlist: UserPlaylist) => void
}

export function CreatePlaylistModal({
  open,
  onClose,
  onCreated,
}: CreatePlaylistModalProps) {
  const [name, setName] = useState('')
  const [selectedThemeId, setSelectedThemeId] = useState<string>(
    PLAYLIST_COVER_THEMES[0].id,
  )

  useEffect(() => {
    if (!open) return
    setName('')
    setSelectedThemeId(PLAYLIST_COVER_THEMES[0].id)
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

  const selectedTheme =
    PLAYLIST_COVER_THEMES.find((theme) => theme.id === selectedThemeId) ??
    PLAYLIST_COVER_THEMES[0]

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    const playlist = createPlaylist(trimmed, {
      coverUrl: selectedTheme.coverUrl,
    })
    onCreated?.(playlist)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="azuri-create-playlist-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="azuri-create-playlist-title"
            className="text-base font-bold text-white"
          >
            Nova playlist
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-4">
            <img
              src={selectedTheme.coverUrl}
              alt=""
              className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <label
                htmlFor="azuri-playlist-name"
                className="mb-1.5 block text-xs font-medium text-gray-400"
              >
                Nome
              </label>
              <input
                id="azuri-playlist-name"
                autoFocus
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex: Mix Neon, Focus Flow..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-400">
              Capa / tema
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {PLAYLIST_COVER_THEMES.map((theme) => {
                const isSelected = theme.id === selectedThemeId
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedThemeId(theme.id)}
                    aria-pressed={isSelected}
                    aria-label={theme.label}
                    className={`overflow-hidden rounded-xl ring-2 transition-all ${
                      isSelected
                        ? 'ring-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.35)]'
                        : 'ring-transparent hover:ring-white/20'
                    }`}
                  >
                    <img
                      src={theme.coverUrl}
                      alt={theme.label}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                )
              })}
            </div>
            <p className="mt-2 truncate text-xs text-gray-500">
              {selectedTheme.label}
            </p>
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cyan-400 px-4 py-2.5 text-sm font-bold text-[#080B12] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} />
            Criar playlist
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
