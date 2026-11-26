import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Music2,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fileToDataUrl,
  prepareAudioFile,
  saveUserRelease,
  type ReleaseType,
  type UserTrack,
} from '../services/creatorService'
import { saveCustomLyrics } from '../services/lyricsService'
import { getUserProfile } from '../services/userProfileService'

const ICON_STROKE = 1.5

type DraftTrack = {
  key: string
  title: string
  featArtists: string
  audioUrl: string
  durationMs: number
  lyrics: string
  audioFileName: string
  lyricsOpen: boolean
  pendingFile: File | null
}

const FORMAT_OPTIONS: { id: ReleaseType; label: string; hint: string }[] = [
  { id: 'single', label: 'Single', hint: '1 faixa' },
  { id: 'ep', label: 'EP', hint: '2–6 faixas' },
  { id: 'album', label: 'Álbum', hint: '7+ faixas' },
]

function createDraftTrack(index = 0): DraftTrack {
  return {
    key: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    featArtists: '',
    audioUrl: '',
    durationMs: 0,
    lyrics: '',
    audioFileName: '',
    lyricsOpen: false,
    pendingFile: null,
  }
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return '—'
  const total = Math.round(ms / 1000)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function StudioUpload() {
  const navigate = useNavigate()
  const profile = useMemo(() => getUserProfile(), [])
  const coverInputRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<ReleaseType>('single')
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [coverPreview, setCoverPreview] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [tracks, setTracks] = useState<DraftTrack[]>([createDraftTrack()])
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [isPublishing, setIsPublishing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    setTracks((prev) => {
      if (type === 'single') return [prev[0] ?? createDraftTrack()]
      if (prev.length === 0) return [createDraftTrack()]
      return prev
    })
  }, [type])

  const tags = useMemo(
    () =>
      tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tagsInput],
  )

  const previewCover = coverPreview || coverUrl

  async function handleCoverFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('A capa precisa ser uma imagem.')
      return
    }
    setCoverFile(file)
    const dataUrl = await fileToDataUrl(file)
    setCoverPreview(dataUrl)
    setError(null)
  }

  function onCoverDrop(event: DragEvent) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files?.[0]
    void handleCoverFile(file ?? null)
  }

  function updateTrack(key: string, patch: Partial<DraftTrack>) {
    setTracks((prev) =>
      prev.map((track) => (track.key === key ? { ...track, ...patch } : track)),
    )
  }

  async function handleAudioFile(key: string, file: File | null) {
    if (!file) return
    try {
      const prepared = await prepareAudioFile(file)
      updateTrack(key, {
        audioUrl: prepared.objectUrl,
        durationMs: prepared.durationMs,
        audioFileName: prepared.fileName,
        pendingFile: file,
      })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler o áudio')
    }
  }

  function addTrack() {
    if (type === 'single') return
    setTracks((prev) => [...prev, createDraftTrack(prev.length)])
  }

  function removeTrack(key: string) {
    setTracks((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((track) => track.key !== key)
    })
  }

  async function handlePublish(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setFeedback(null)

    const releaseTitle = title.trim()
    if (!releaseTitle) {
      setError('Informe o título do lançamento.')
      return
    }

    const expectedCount = type === 'single' ? 1 : tracks.length
    if (type !== 'single' && tracks.length < 2) {
      setError('EP e Álbum precisam de pelo menos 2 faixas.')
      return
    }

    const resolvedTracks: UserTrack[] = []

    for (let index = 0; index < expectedCount; index++) {
      const draft = tracks[index]
      if (!draft) continue

      const trackTitle = draft.title.trim() || `${releaseTitle}${type === 'single' ? '' : ` — ${index + 1}`}`
      let audioUrl = draft.audioUrl.trim()

      if (draft.pendingFile) {
        try {
          audioUrl = await fileToDataUrl(draft.pendingFile)
        } catch {
          setError(`Não foi possível persistir o áudio da faixa ${index + 1}.`)
          return
        }
      }

      if (!audioUrl) {
        setError(`Adicione áudio (ficheiro ou URL) na faixa ${index + 1}.`)
        return
      }

      const trackId = `user-track-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`

      resolvedTracks.push({
        id: trackId,
        trackNumber: index + 1,
        title: trackTitle,
        featArtists: draft.featArtists.trim(),
        audioUrl,
        durationMs: draft.durationMs,
        lyrics: draft.lyrics.trim(),
        plays: 0,
      })

      if (draft.lyrics.trim()) {
        saveCustomLyrics(
          trackId,
          draft.lyrics.trim(),
          draft.durationMs > 0 ? draft.durationMs / 1000 : undefined,
        )
      }
    }

    if (resolvedTracks.length === 0) {
      setError('Adicione pelo menos uma faixa válida.')
      return
    }

    setIsPublishing(true)
    try {
      let finalCover = coverUrl.trim()
      if (coverFile) {
        finalCover = await fileToDataUrl(coverFile)
      } else if (coverPreview) {
        finalCover = coverPreview
      }
      if (!finalCover) {
        finalCover = `https://picsum.photos/seed/${encodeURIComponent(releaseTitle)}/600/600`
      }

      saveUserRelease({
        type,
        title: releaseTitle,
        artistName: profile.name,
        artistHandle: profile.handle,
        coverUrl: finalCover,
        genre: genre.trim(),
        tags,
        description: description.trim(),
        releaseDate: new Date().toISOString().slice(0, 10),
        visibility,
        tracks: resolvedTracks,
      })

      setFeedback('Lançamento publicado! Redirecionando…')
      window.setTimeout(() => navigate('/profile'), 900)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao publicar. O ficheiro pode ser grande demais para o armazenamento local.',
      )
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#0B0F19] pb-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent" />

      <div className="relative mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400/80">
            Azuri Studio
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl md:text-4xl">
            Upload de Lançamento
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#94A3B8]">
            Publique singles, EPs e álbuns no modo local. Os dados ficam no seu
            navegador, prontos para migrar para um banco depois.
          </p>
        </header>

        <form
          onSubmit={(event) => void handlePublish(event)}
          className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        >
          <section className="space-y-5 rounded-2xl border border-white/10 bg-[#111827]/70 p-5 backdrop-blur-xl md:p-6 lg:col-span-7">
            <div>
              <h2 className="mb-3 text-sm font-semibold text-white">Formato</h2>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map((option) => {
                  const active = type === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setType(option.id)}
                      className={`rounded-full px-4 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-cyan-400 font-bold text-[#0B0F19]'
                          : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {option.label}
                      <span className={`ml-2 text-[10px] ${active ? 'text-[#0B0F19]/70' : 'text-[#94A3B8]'}`}>
                        {option.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-white">Capa e metadados</h2>
              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onCoverDrop}
                className={`mb-4 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors ${
                  dragOver
                    ? 'border-cyan-400 bg-cyan-400/10'
                    : 'border-white/15 bg-white/5 hover:border-cyan-400/40'
                }`}
              >
                {previewCover ? (
                  <img
                    src={previewCover}
                    alt="Prévia da capa"
                    className="h-28 w-28 rounded-xl object-cover shadow-lg"
                  />
                ) : (
                  <ImagePlus className="h-10 w-10 text-cyan-400/80" strokeWidth={ICON_STROKE} />
                )}
                <div>
                  <p className="text-sm text-white">Arraste a capa aqui</p>
                  <p className="text-xs text-[#94A3B8]">PNG, JPG ou WEBP</p>
                </div>
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-semibold text-gray-200 hover:border-cyan-400/50 hover:text-cyan-300"
                >
                  Escolher imagem
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) =>
                    void handleCoverFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>

              <div className="grid gap-3">
                <Field
                  label="URL da capa (opcional)"
                  value={coverUrl}
                  onChange={(value) => {
                    setCoverUrl(value)
                    if (value.trim()) {
                      setCoverFile(null)
                      setCoverPreview(value.trim())
                    }
                  }}
                  placeholder="https://..."
                />
                <Field
                  label="Título do lançamento"
                  value={title}
                  onChange={setTitle}
                  placeholder="Ex: Neon After Hours"
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Gênero"
                    value={genre}
                    onChange={setGenre}
                    placeholder="Synthwave"
                  />
                  <Field
                    label="Tags (vírgula)"
                    value={tagsInput}
                    onChange={setTagsInput}
                    placeholder="night drive, retro, azuri"
                  />
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#94A3B8]">
                    Descrição
                  </span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-400/50"
                    placeholder="Conte a história deste lançamento..."
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['public', 'private'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setVisibility(value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        visibility === value
                          ? 'bg-cyan-400 text-[#0B0F19]'
                          : 'border border-white/10 bg-white/5 text-gray-300'
                      }`}
                    >
                      {value === 'public' ? 'Público' : 'Privado'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Tracklist</h2>
                {type !== 'single' && (
                  <button
                    type="button"
                    onClick={addTrack}
                    className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/10"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                    Adicionar Faixa
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {tracks.map((track, index) => (
                  <TrackEditor
                    key={track.key}
                    index={index}
                    track={track}
                    canRemove={type !== 'single' && tracks.length > 1}
                    onChange={(patch) => updateTrack(track.key, patch)}
                    onRemove={() => removeTrack(track.key)}
                    onAudioFile={(file) => void handleAudioFile(track.key, file)}
                  />
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            {feedback && (
              <p className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                {feedback}
              </p>
            )}

            <button
              type="submit"
              disabled={isPublishing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-400 px-5 py-3 text-sm font-bold text-[#0B0F19] shadow-[0_0_20px_rgba(34,211,238,0.35)] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" strokeWidth={ICON_STROKE} />
              {isPublishing ? 'Publicando…' : 'Publicar Lançamento'}
            </button>
          </section>

          <aside className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5 shadow-2xl backdrop-blur-xl">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                Preview ao vivo
              </p>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F19]">
                <div className="relative aspect-square bg-gradient-to-br from-[#131C2E] to-[#0B0F19]">
                  {previewCover ? (
                    <img
                      src={previewCover}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#94A3B8]">
                      <Music2 className="h-10 w-10" strokeWidth={ICON_STROKE} />
                      <span className="text-xs">Sem capa</span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-cyan-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#0B0F19]">
                    {type}
                  </span>
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="truncate text-lg font-bold text-white">
                    {title.trim() || 'Título do lançamento'}
                  </h3>
                  <p className="truncate text-sm text-[#94A3B8]">
                    {profile.name} · {profile.handle}
                  </p>
                  {genre && (
                    <p className="text-xs uppercase tracking-wide text-cyan-300/80">
                      {genre}
                    </p>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-[#94A3B8]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {description.trim() && (
                    <p className="line-clamp-3 pt-1 text-xs leading-relaxed text-[#94A3B8]">
                      {description}
                    </p>
                  )}
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                    {tracks.map((track, index) => (
                      <div
                        key={track.key}
                        className="flex items-center justify-between gap-2 text-xs text-[#94A3B8]"
                      >
                        <span className="truncate text-white">
                          {index + 1}. {track.title.trim() || `Faixa ${index + 1}`}
                          {track.featArtists.trim()
                            ? ` (feat. ${track.featArtists.trim()})`
                            : ''}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatDuration(track.durationMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#94A3B8]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-400/50"
      />
    </label>
  )
}

function TrackEditor({
  index,
  track,
  canRemove,
  onChange,
  onRemove,
  onAudioFile,
}: {
  index: number
  track: DraftTrack
  canRemove: boolean
  onChange: (patch: Partial<DraftTrack>) => void
  onRemove: () => void
  onAudioFile: (file: File | null) => void
}) {
  const audioInputRef = useRef<HTMLInputElement>(null)

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    onAudioFile(event.target.files?.[0] ?? null)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F19]/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-300">
          Faixa {index + 1}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover faixa ${index + 1}`}
            className="rounded-full p-1.5 text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </button>
        )}
      </div>

      <div className="grid gap-3">
        <Field
          label="Título da faixa"
          value={track.title}
          onChange={(value) => onChange({ title: value })}
          placeholder="Nome da música"
        />
        <Field
          label="Participações (feat.)"
          value={track.featArtists}
          onChange={(value) => onChange({ featArtists: value })}
          placeholder="Artista 1, Artista 2"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#94A3B8]">
              Ficheiro de áudio
            </span>
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
            >
              <UploadCloud className="h-4 w-4" strokeWidth={ICON_STROKE} />
              {track.audioFileName || 'mp3 / wav / ogg'}
            </button>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,audio/*,.mp3,.wav,.ogg"
              className="hidden"
              onChange={onFileChange}
            />
            {track.durationMs > 0 && (
              <p className="mt-1 text-[11px] text-cyan-300/80">
                Duração: {formatDuration(track.durationMs)}
              </p>
            )}
          </div>
          <Field
            label="URL de áudio"
            value={track.pendingFile ? '' : track.audioUrl.startsWith('blob:') ? '' : track.audioUrl}
            onChange={(value) =>
              onChange({
                audioUrl: value,
                pendingFile: null,
                audioFileName: '',
                durationMs: track.pendingFile ? 0 : track.durationMs,
              })
            }
            placeholder="https://.../track.mp3"
          />
        </div>

        <button
          type="button"
          onClick={() => onChange({ lyricsOpen: !track.lyricsOpen })}
          className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-[#94A3B8] transition-colors hover:text-cyan-300"
        >
          {track.lyricsOpen ? (
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          )}
          + Adicionar Letra
        </button>

        {track.lyricsOpen && (
          <textarea
            value={track.lyrics}
            onChange={(event) => onChange({ lyrics: event.target.value })}
            rows={5}
            placeholder="Cole a letra aqui (texto simples ou LRC com timestamps)"
            className="w-full resize-none rounded-xl border border-white/10 bg-[#111827] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-400/50"
          />
        )}
      </div>
    </div>
  )
}
