import {
  Check,
  Heart,
  Play,
  Plus,
  Share2,
  Shuffle,
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ShareModal } from '../components/ShareModal'
import { TrackRow } from '../components/TrackRow'
import { TrackWaveform } from '../components/TrackWaveform'
import { getAlbumDetails } from '../services/spotify'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5

function formatTotalDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes} min ${seconds} s`
}

function formatReleaseDate(date?: string) {
  if (!date) return '—'
  const parts = date.split('-').map(Number)
  const [year, month = 1, day = 1] = parts
  try {
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return date
  }
}

function albumTypeLabel(type?: string) {
  if (type === 'single') return 'Single'
  if (type === 'compilation') return 'Compilação'
  if (type === 'ep') return 'EP'
  return 'Álbum'
}

export function Album() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const playTrack = usePlayerStore((state) => state.playTrack)

  const [album, setAlbum] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    async function loadAlbum() {
      if (!id) return
      setLoading(true)
      const data = await getAlbumDetails(id)
      setAlbum(data)
      setLoading(false)
    }
    void loadAlbum()
  }, [id])

  const totalDurationMs = useMemo(() => {
    if (!album?.tracks?.length) return 0
    return album.tracks.reduce(
      (sum: number, track: any) => sum + (track.duration_ms ?? 0),
      0,
    )
  }, [album])

  const coverUrl = album?.images?.[0]?.url as string | undefined
  const primaryArtist = album?.artists?.[0]

  function handlePlayTrack(track: any) {
    if (!album?.tracks?.length) return
    const queue = isShuffle
      ? [...album.tracks].sort(() => Math.random() - 0.5)
      : album.tracks
    void playTrack(track, queue)
  }

  function handlePlayAll() {
    if (!album?.tracks?.length) return
    const queue = isShuffle
      ? [...album.tracks].sort(() => Math.random() - 0.5)
      : album.tracks
    void playTrack(queue[0], queue)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-cyan-400">
        Carregando álbum...
      </div>
    )
  }

  if (!album) {
    return (
      <div className="p-10 text-red-400">Não foi possível carregar o álbum.</div>
    )
  }

  return (
    <div className="min-h-full w-full pb-36">
      {/* HERO IMERSIVO — fundo full-bleed, conteúdo alinhado ao grid */}
      <div className="relative w-full overflow-hidden bg-[#0B0F19]">
        {coverUrl && (
          <div
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-45 blur-3xl"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/85 to-transparent" />

        <div className="relative z-10 mx-auto flex max-w-[1600px] flex-col items-center gap-5 px-6 pb-8 pt-4 text-center md:flex-row md:items-end md:gap-8 md:px-10 md:pb-10 md:pt-4 md:text-left">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={album.name}
              className="h-44 w-44 shrink-0 rounded-xl border border-white/10 object-cover shadow-[0_20px_50px_rgba(0,0,0,0.7)] md:h-52 md:w-52"
            />
          ) : (
            <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-gray-500 shadow-[0_20px_50px_rgba(0,0,0,0.7)] md:h-52 md:w-52">
              Sem capa
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="mb-2 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
              {albumTypeLabel(album.album_type)}
            </span>

            <h1 className="mb-3 line-clamp-2 text-4xl font-black tracking-tight text-white md:text-6xl">
              {album.name}
            </h1>

            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm font-medium text-gray-300 md:justify-start">
              {primaryArtist && (
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-cyan-400/20 text-[10px] font-bold text-cyan-400">
                    {primaryArtist.name?.[0]?.toUpperCase() ?? 'A'}
                  </span>
                </span>
              )}

              {album.artists?.map((artist: any, i: number) => (
                <React.Fragment key={artist.id ?? artist.name}>
                  <button
                    type="button"
                    onClick={() =>
                      artist.id && navigate(`/artist/${artist.id}`)
                    }
                    className="transition-colors hover:text-cyan-400 hover:underline"
                  >
                    {artist.name}
                  </button>
                  {i < album.artists.length - 1 && <span>•</span>}
                </React.Fragment>
              ))}

              <span className="text-gray-500">•</span>
              <span>{album.release_date?.split('-')[0] ?? '—'}</span>
              <span className="text-gray-500">•</span>
              <span>
                {album.total_tracks}{' '}
                {album.total_tracks === 1 ? 'faixa' : 'faixas'}
              </span>
              <span className="text-gray-500">•</span>
              <span>{formatTotalDuration(totalDurationMs)}</span>
            </div>

            {/* Waveform Master do Álbum */}
            <TrackWaveform
              trackId={album.id ?? 'album'}
              trackName={album.name ?? 'Album'}
              durationMs={totalDurationMs}
              barCount={95}
              variant="album"
              interactiveSeek={false}
              className="mt-4 h-8 max-w-xl opacity-80"
            />
          </div>
        </div>
      </div>

      {/* AÇÕES + LAYOUT 2 COLUNAS */}
      <div className="mx-auto max-w-[1600px] px-6 md:px-10">
        <div className="flex flex-wrap items-center gap-4 py-6">
          <button
            type="button"
            onClick={handlePlayAll}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400 text-black shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-transform hover:scale-105"
            aria-label="Tocar álbum"
          >
            <Play
              className="ml-1 h-7 w-7 fill-current"
              strokeWidth={ICON_STROKE}
            />
          </button>

          <button
            type="button"
            onClick={() => setIsShuffle((prev) => !prev)}
            className={`rounded-full p-2.5 transition-colors ${
              isShuffle
                ? 'text-cyan-400'
                : 'text-gray-400 hover:text-white'
            }`}
            aria-label="Modo aleatório"
            aria-pressed={isShuffle}
          >
            <Shuffle className="h-5 w-5" strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            onClick={() => setIsLiked((prev) => !prev)}
            className={`rounded-full p-2.5 transition-colors ${
              isLiked ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
            aria-label="Curtir álbum"
            aria-pressed={isLiked}
          >
            <Heart
              className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`}
              strokeWidth={ICON_STROKE}
            />
          </button>

          <button
            type="button"
            onClick={() => setIsSaved((prev) => !prev)}
            className={`rounded-full p-2.5 transition-colors ${
              isSaved ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
            aria-label="Salvar na biblioteca"
            aria-pressed={isSaved}
          >
            {isSaved ? (
              <Check className="h-5 w-5" strokeWidth={ICON_STROKE} />
            ) : (
              <Plus className="h-5 w-5" strokeWidth={ICON_STROKE} />
            )}
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setShareOpen(true)
            }}
            className="rounded-full p-2.5 text-gray-400 transition-colors hover:text-white"
            aria-label="Partilhar álbum"
          >
            <Share2 className="h-5 w-5" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-8 pb-10 lg:grid-cols-3">
          {/* LISTA DE FAIXAS */}
          <div className="lg:col-span-2">
            <h2 className="mb-5 text-2xl font-bold text-white">Faixas</h2>

            {album.tracks?.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {album.tracks.map((track: any, index: number) => (
                  <TrackRow
                    key={track.id ?? `${track.name}-${index}`}
                    track={track}
                    index={index}
                    variant="compact"
                    artistsFallback={primaryArtist?.name}
                    onPlay={() => handlePlayTrack(track)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Nenhuma faixa encontrada neste álbum.</p>
            )}
          </div>

          {/* PAINEL LATERAL */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-white/5 bg-[#111827]/80 p-6">
              <h3 className="mb-5 text-xs font-bold uppercase tracking-wider text-gray-400">
                Detalhes do Lançamento
              </h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">Tipo</span>
                  <span className="font-medium text-white">
                    {albumTypeLabel(album.album_type)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">Lançamento</span>
                  <span className="text-right font-medium text-white">
                    {formatReleaseDate(album.release_date)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">Faixas</span>
                  <span className="font-medium text-white">
                    {album.total_tracks ?? album.tracks?.length ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">Duração Total</span>
                  <span className="font-medium text-white">
                    {formatTotalDuration(totalDurationMs)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">Gravadora</span>
                  <span className="text-right font-medium text-white">
                    {album.label || 'Independente'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/5 bg-[#111827]/80 p-6">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-400">
                Artista Principal
              </h3>
              <p className="mb-4 text-lg font-bold text-white">
                {primaryArtist?.name ?? 'Artista desconhecido'}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (primaryArtist?.id) {
                    navigate(`/artist/${primaryArtist.id}`)
                  }
                }}
                disabled={!primaryArtist?.id}
                className="w-full rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-400 transition-colors hover:border-cyan-400 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Ver Perfil Completo
              </button>
              {album.copyrights?.[0]?.text && (
                <p className="mt-4 text-xs text-gray-500">
                  {album.copyrights[0].text}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={album.name}
        artist={primaryArtist?.name ?? 'Azuri Music'}
        coverUrl={coverUrl}
        shareUrl={
          typeof window !== 'undefined'
            ? `${window.location.origin}/album/${album.id}`
            : `/album/${album.id}`
        }
      />
    </div>
  )
}
