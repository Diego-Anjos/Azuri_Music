import { Camera, MapPin, Play, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { TrackRow } from '../components/TrackRow'
import {
  getArtistProfile,
  type ArtistProfile,
  type ArtistProfileTrack,
} from '../services/spotify'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5

type ArtistLocationState = {
  artistName?: string
}

function bannerStorageKey(artistId: string) {
  return `azuri_banner_${artistId}`
}

export function Artist() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const playTrack = usePlayerStore((state) => state.playTrack)
  const artistName =
    (location.state as ArtistLocationState | null)?.artistName || ''

  const [artist, setArtist] = useState<ArtistProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [showAllTracks, setShowAllTracks] = useState(false)
  const [isBioExpanded, setIsBioExpanded] = useState(false)
  const [customBannerUrl, setCustomBannerUrl] = useState<string | null>(null)
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false)
  const [bannerInput, setBannerInput] = useState('')

  useEffect(() => {
    async function loadData() {
      if (!id) return
      setLoading(true)
      setIsBioExpanded(false)
      const data = await getArtistProfile(id, artistName || undefined)
      setArtist(data)

      if (data?.id) {
        const saved = localStorage.getItem(bannerStorageKey(data.id))
        setCustomBannerUrl(saved)
        setBannerInput(saved ?? '')
      } else {
        setCustomBannerUrl(null)
        setBannerInput('')
      }

      setLoading(false)
    }

    void loadData()
  }, [id, artistName])

  const avatarUrl = artist?.images?.[0]?.url
  const fallbackBannerUrl =
    artist?.albums?.[0]?.imageUrl || artist?.images?.[0]?.url || null

  const bannerUrl = useMemo(() => {
    return customBannerUrl || artist?.bannerUrl || fallbackBannerUrl
  }, [customBannerUrl, artist?.bannerUrl, fallbackBannerUrl])

  function handlePlayTrack(track: ArtistProfileTrack) {
    if (!artist) return
    void playTrack(track, artist.topTracks)
  }

  function handlePlayAll() {
    const first = artist?.topTracks[0]
    if (!first || !artist) return
    void playTrack(first, artist.topTracks)
  }

  function handleSaveBanner() {
    if (!artist) return
    const trimmed = bannerInput.trim()
    if (!trimmed) {
      localStorage.removeItem(bannerStorageKey(artist.id))
      setCustomBannerUrl(null)
    } else {
      localStorage.setItem(bannerStorageKey(artist.id), trimmed)
      setCustomBannerUrl(trimmed)
    }
    setIsBannerModalOpen(false)
  }

  function handleClearBanner() {
    if (!artist) return
    localStorage.removeItem(bannerStorageKey(artist.id))
    setCustomBannerUrl(null)
    setBannerInput('')
    setIsBannerModalOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-cyan-400">
        Carregando perfil...
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="flex-1 p-10 text-red-400">
        Não foi possível carregar o perfil do artista.
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#0B0F19] pb-32">
      {/* 1. BANNER PANORÂMICO (SoundCloud + Spotify + Azuri) */}
      <div className="group relative h-72 w-full overflow-hidden bg-[#0B0F19] md:h-80">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#111827] to-[#0B0F19]" />
        )}

        {/* Gradiente suave — capa nítida, texto legível */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/40 to-black/30" />

        {/* Editar capa */}
        <button
          type="button"
          onClick={() => {
            setBannerInput(customBannerUrl ?? '')
            setIsBannerModalOpen(true)
          }}
          className="absolute top-4 right-6 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-gray-200 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 hover:bg-black/80"
        >
          <Camera className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Editar Capa
        </button>

        {/* Conteúdo do Header */}
        <div className="absolute bottom-0 z-10 flex w-full flex-col items-center gap-5 p-6 text-center md:flex-row md:items-end md:gap-6 md:p-10 md:text-left">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={artist.name}
              className="h-36 w-36 shrink-0 rounded-full border-4 border-[#0B0F19] object-cover shadow-2xl md:h-44 md:w-44"
            />
          ) : (
            <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-full border-4 border-[#0B0F19] bg-gray-800 shadow-2xl md:h-44 md:w-44">
              <span className="text-gray-500">Sem foto</span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-center gap-2 md:justify-start">
              <span className="rounded-full border border-cyan-500/30 bg-[#111827]/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400 backdrop-blur-sm">
                Artista Verificado
              </span>
            </div>

            <h1 className="mb-5 line-clamp-2 text-4xl font-bold tracking-tight text-white md:text-6xl">
              {artist.name}
            </h1>

            <div className="flex items-center justify-center gap-4 md:justify-start">
              <button
                type="button"
                onClick={handlePlayAll}
                disabled={artist.topTracks.length === 0}
                aria-label="Tocar faixas em destaque"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                <Play
                  className="ml-1 h-7 w-7 fill-current"
                  strokeWidth={ICON_STROKE}
                />
              </button>

              <button
                type="button"
                onClick={() => setIsFollowing((prev) => !prev)}
                className={`rounded-full border px-8 py-3 font-bold transition-colors ${
                  isFollowing
                    ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                    : 'border-gray-400 text-white hover:border-white hover:bg-white/10'
                }`}
              >
                {isFollowing ? 'Seguindo' : 'Seguir'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Editar Capa */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Editar Capa</h2>
              <button
                type="button"
                onClick={() => setIsBannerModalOpen(false)}
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-400">
              Cole o URL de uma imagem panorâmica para usar como capa deste
              artista neste dispositivo.
            </p>
            <input
              type="url"
              value={bannerInput}
              onChange={(e) => setBannerInput(e.target.value)}
              placeholder="https://..."
              className="mb-4 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-cyan-400/50"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveBanner}
                className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105"
              >
                Guardar Capa
              </button>
              <button
                type="button"
                onClick={handleClearBanner}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-white/30 hover:text-white"
              >
                Remover personalizada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. GRID PRINCIPAL DE CONTEÚDO */}
      <div className="mx-auto max-w-[1600px] p-6 md:p-10">
        <div className="grid grid-cols-1 gap-8 md:gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* 1. FAIXAS EM DESTAQUE */}
            <h2 className="mb-6 text-2xl font-bold text-white">
              Faixas em Destaque
            </h2>

            {artist.topTracks?.length > 0 ? (
              <>
                <div className="flex flex-col gap-2">
                  {artist.topTracks
                    .slice(0, showAllTracks ? artist.topTracks.length : 5)
                    .map((track, index) => (
                      <TrackRow
                        key={`${track.id}-${index}`}
                        track={track}
                        index={index}
                        variant="featured"
                        artistsFallback={artist.name}
                        onPlay={() => handlePlayTrack(track)}
                      />
                    ))}
                </div>

                {artist.topTracks.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTracks((prev) => !prev)}
                    className="mt-6 text-sm font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-white"
                  >
                    {showAllTracks ? 'Mostrar Menos' : 'Ver Mais'}
                  </button>
                )}
              </>
            ) : (
              <p className="text-gray-400">
                Nenhuma faixa em destaque encontrada.
              </p>
            )}

            {/* 2. DISCOGRAFIA (ÁLBUNS E SINGLES) */}
            <h2 className="mb-6 mt-16 text-2xl font-bold text-white">
              Discografia
            </h2>
            {artist.albums?.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
                {artist.albums.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => navigate(`/album/${album.id}`)}
                    className="group cursor-pointer rounded-xl border border-transparent bg-[#111827] p-4 transition-all hover:border-white/10 hover:bg-white/5"
                  >
                    <div className="relative mb-4 overflow-hidden rounded-md shadow-lg">
                      {album.imageUrl ? (
                        <img
                          src={album.imageUrl}
                          alt={album.name}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-white/5 text-xs text-gray-500">
                          Sem capa
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-4 items-center justify-center rounded-full bg-cyan-400 text-black opacity-0 shadow-lg shadow-cyan-400/50 transition-all group-hover:translate-y-0 group-hover:opacity-100"
                        aria-label={`Tocar ${album.name}`}
                      >
                        <Play
                          className="ml-1 h-5 w-5 fill-current"
                          strokeWidth={ICON_STROKE}
                        />
                      </button>
                    </div>
                    <h3 className="truncate font-bold text-white transition-colors group-hover:text-cyan-400">
                      {album.name}
                    </h3>
                    <p className="mt-1 text-sm capitalize text-gray-400">
                      {album.albumType === 'single' ? 'Single' : 'Álbum'} •{' '}
                      {album.year}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Nenhum lançamento encontrado.</p>
            )}
          </div>

          <div className="space-y-8 lg:col-span-1">
            <div className="rounded-2xl border border-white/5 bg-[#111827]/90 p-6">
              <h3 className="mb-5 text-xs font-bold uppercase tracking-wider text-gray-400">
                Resumo do Artista
              </h3>

              {/* Métricas estilo SoundCloud */}
              <div className="grid grid-cols-3 gap-3">
                <div className="min-w-0">
                  <p className="text-xl font-bold text-white">
                    {new Intl.NumberFormat('pt-BR', {
                      notation: 'compact',
                      compactDisplay: 'short',
                    }).format(artist.followers ?? 0)}
                  </p>
                  <p className="mt-0.5 text-xs uppercase text-gray-400">
                    Seguidores
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold text-white">
                    {artist.totalTracksCount ?? artist.topTracks?.length ?? 0}
                  </p>
                  <p className="mt-0.5 text-xs uppercase text-gray-400">
                    Músicas
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold text-white">
                    {artist.albums?.length || 0}
                  </p>
                  <p className="mt-0.5 text-xs uppercase text-gray-400">
                    Lançamentos
                  </p>
                </div>
              </div>

              {/* Barra de popularidade / alcance */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase text-gray-400">
                    Popularidade
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {artist.popularity}/100
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, artist.popularity ?? 0))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Biografia */}
              {artist.description ? (
                <div className="mt-4 border-t border-white/5 pt-4">
                  <p
                    className={`text-sm leading-relaxed text-gray-300 ${
                      isBioExpanded ? '' : 'line-clamp-3'
                    }`}
                  >
                    {artist.description}
                  </p>
                  {artist.description.length > 140 && (
                    <button
                      type="button"
                      onClick={() => setIsBioExpanded((prev) => !prev)}
                      className="mt-2 text-xs font-medium text-cyan-400 transition-colors hover:text-cyan-300"
                    >
                      {isBioExpanded ? 'Ver menos' : 'Ver mais'}
                    </button>
                  )}
                </div>
              ) : null}

              {/* Localização */}
              {artist.location ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} />
                  {artist.location}
                </p>
              ) : null}

              {/* Géneros */}
              {artist.genres && artist.genres.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {artist.genres.slice(0, 6).map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-400"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/5 bg-[#111827] p-6">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-400">
                Lançamentos Recentes
              </h3>

              {artist.albums?.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {artist.albums.slice(0, 4).map((album) => (
                    <div
                      key={album.id}
                      onClick={() => navigate(`/album/${album.id}`)}
                      className="group min-w-0 cursor-pointer"
                    >
                      {album.imageUrl ? (
                        <img
                          src={album.imageUrl}
                          alt={album.name}
                          className="mb-2 aspect-square w-full rounded-md object-cover transition-opacity group-hover:opacity-80"
                        />
                      ) : (
                        <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-md bg-white/5 text-[10px] text-gray-500">
                          Sem capa
                        </div>
                      )}
                      <p className="truncate text-sm font-medium text-white">
                        {album.name}
                      </p>
                      <p className="text-xs text-gray-400">{album.year}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  Nenhum lançamento encontrado.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
