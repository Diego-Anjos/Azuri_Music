import { ChevronLeft, ChevronRight, Loader2, MapPin, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { TrackRow } from '../components/TrackRow'
import {
  getAllArtistTracks,
  getArtistProfile,
  type ArtistProfile,
  type ArtistProfileTrack,
} from '../services/spotify'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5
const TRACKS_PER_PAGE = 10

type ArtistLocationState = {
  artistName?: string
}

function isValidHttpsUrl(url: string | null | undefined): url is string {
  return Boolean(url && /^https:\/\//i.test(url.trim()))
}

function getAlbumFallback(artist: ArtistProfile): string | null {
  const albumCover = artist.albums?.[0]?.imageUrl
  return isValidHttpsUrl(albumCover) ? albumCover : null
}

function getAvatarFallback(artist: ArtistProfile): string | null {
  const avatar = artist.images?.[0]?.url
  return isValidHttpsUrl(avatar) ? avatar : null
}

function resolveInitialBanner(artist: ArtistProfile): {
  src: string | null
  isOfficial: boolean
} {
  if (isValidHttpsUrl(artist.bannerUrl)) {
    return { src: artist.bannerUrl.trim(), isOfficial: true }
  }
  const album = getAlbumFallback(artist)
  if (album) return { src: album, isOfficial: false }
  const avatar = getAvatarFallback(artist)
  if (avatar) return { src: avatar, isOfficial: false }
  return { src: null, isOfficial: false }
}

function buildPageNumbers(totalPages: number, currentPage: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set<number>([1, totalPages, currentPage])
  for (let delta = 1; delta <= 2; delta++) {
    if (currentPage - delta > 1) pages.add(currentPage - delta)
    if (currentPage + delta < totalPages) pages.add(currentPage + delta)
  }

  return [...pages].sort((a, b) => a - b)
}

export function Artist() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const playTrack = usePlayerStore((state) => state.playTrack)
  // Nome opcional da navegação — lido via ref (não como dependência do efeito)
  // para evitar reload quando o state muda sem mudar o id da rota.
  const tracksSectionRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)
  const artistNameHintRef = useRef<string | undefined>(undefined)
  artistNameHintRef.current =
    (location.state as ArtistLocationState | null)?.artistName || undefined

  const [artist, setArtist] = useState<ArtistProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [allTracks, setAllTracks] = useState<ArtistProfileTrack[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [showAllTracks, setShowAllTracks] = useState(false)
  const [isLoadingTracks, setIsLoadingTracks] = useState(false)
  const [isBioExpanded, setIsBioExpanded] = useState(false)
  const [bannerSrc, setBannerSrc] = useState<string | null>(null)
  const [isOfficialBanner, setIsOfficialBanner] = useState(false)

  useEffect(() => {
    if (!id) return

    const requestId = ++requestIdRef.current
    const artistNameHint = artistNameHintRef.current

    async function loadData() {
      setLoading(true)
      setIsBioExpanded(false)
      setBannerSrc(null)
      setIsOfficialBanner(false)
      setAllTracks([])
      setCurrentPage(1)
      setShowAllTracks(false)
      setIsLoadingTracks(true)

      const data = await getArtistProfile(id, artistNameHint)
      if (requestId !== requestIdRef.current) return

      setArtist(data)

      if (data) {
        const resolved = resolveInitialBanner(data)
        setBannerSrc(resolved.src)
        setIsOfficialBanner(resolved.isOfficial)

        // Mostra topTracks imediatamente enquanto o catálogo completo carrega
        setAllTracks(data.topTracks ?? [])

        // Fallback multi-fonte já traz faixas suficientes — evita novas
        // chamadas Spotify em cooldown e corridas de estado.
        if (data.isFallback) {
          setIsLoadingTracks(false)
          setLoading(false)
          return
        }

        try {
          const catalog = await getAllArtistTracks(data.id, data.name, {
            artistImageUrl: data.images?.[0]?.url ?? null,
          })
          if (requestId !== requestIdRef.current) return

          const unified =
            catalog.tracks.length > 0 ? catalog.tracks : data.topTracks ?? []
          // Resumo e lista ficam iguais: max(catálogo unificado, SoundCloud)
          const syncedTotal = Math.max(
            unified.length,
            catalog.soundcloudTotal,
            catalog.total,
          )

          setAllTracks(unified)
          setArtist({
            ...data,
            topTracks: unified,
            totalTracksCount: syncedTotal,
          })
        } catch (error) {
          console.error('Erro ao carregar catálogo completo:', error)
        } finally {
          if (requestId === requestIdRef.current) {
            setIsLoadingTracks(false)
          }
        }
      } else if (requestId === requestIdRef.current) {
        setIsLoadingTracks(false)
      }

      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }

    void loadData()
  }, [id])

  const avatarUrl = artist?.images?.[0]?.url
  const loadedCount = allTracks.length
  // Mesmo número no Resumo e no "Mostrando … de N músicas"
  const displayTrackCount =
    loadedCount > 0
      ? Math.max(artist?.totalTracksCount ?? 0, loadedCount)
      : artist?.totalTracksCount ?? 0
  const totalPages = Math.max(1, Math.ceil(loadedCount / TRACKS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = showAllTracks ? 0 : (safePage - 1) * TRACKS_PER_PAGE
  const endIndex = showAllTracks
    ? loadedCount
    : Math.min(startIndex + TRACKS_PER_PAGE, loadedCount)
  const visibleTracks = allTracks.slice(startIndex, endIndex)
  const showPagination = !showAllTracks && loadedCount > TRACKS_PER_PAGE
  const pageNumbers = buildPageNumbers(totalPages, safePage)

  function scrollToTracksSection() {
    tracksSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function goToPage(page: number) {
    const next = Math.min(totalPages, Math.max(1, page))
    setShowAllTracks(false)
    setCurrentPage(next)
    scrollToTracksSection()
  }

  function handlePlayTrack(track: ArtistProfileTrack) {
    if (!artist) return
    void playTrack(track, allTracks.length > 0 ? allTracks : artist.topTracks)
  }

  function handlePlayAll() {
    const queue = allTracks.length > 0 ? allTracks : artist?.topTracks ?? []
    const first = queue[0]
    if (!first || !artist) return
    void playTrack(first, queue)
  }

  function handleBannerError() {
    if (!artist) {
      setBannerSrc(null)
      setIsOfficialBanner(false)
      return
    }

    const fallback =
      getAlbumFallback(artist) || getAvatarFallback(artist) || null

    if (fallback && fallback !== bannerSrc) {
      setBannerSrc(fallback)
      setIsOfficialBanner(false)
      return
    }

    setBannerSrc(null)
    setIsOfficialBanner(false)
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
      {artist.isFallback && (
        <div
          role="status"
          className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200/90 md:px-8"
        >
          Exibindo catálogo local e alternativo enquanto a API do Spotify
          aguarda liberação
        </div>
      )}

      {/* 1. BANNER PANORÂMICO (SoundCloud + Spotify + Azuri) */}
      <div className="relative h-72 w-full overflow-hidden bg-[#0B0F19] pt-2 md:h-80 md:pt-4">
        {bannerSrc ? (
          <img
            src={bannerSrc}
            alt=""
            onError={handleBannerError}
            className={`absolute inset-0 h-full w-full object-cover object-center ${
              isOfficialBanner
                ? 'scale-100 opacity-80 blur-none'
                : 'scale-110 opacity-60 blur-md'
            }`}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#111827] to-[#0B0F19]" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/40 to-black/30" />

        <div className="absolute bottom-0 z-10 flex w-full flex-col items-center gap-4 px-4 text-center sm:flex-row sm:items-end sm:gap-6 sm:text-left md:gap-6 md:px-8 md:pb-6">
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

          <div className="min-w-0 flex-1 pb-4 sm:pb-0">
            <div className="mb-2 flex items-center justify-center gap-2 sm:justify-start">
              <span className="rounded-full border border-cyan-500/30 bg-[#111827]/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400 backdrop-blur-sm">
                Artista Verificado
              </span>
            </div>

            <h1 className="mb-5 line-clamp-2 text-2xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
              {artist.name}
            </h1>

            <div className="flex items-center justify-center gap-4 sm:justify-start">
              <button
                type="button"
                onClick={handlePlayAll}
                disabled={allTracks.length === 0}
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

      {/* 2. GRID PRINCIPAL DE CONTEÚDO */}
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* 1. FAIXAS EM DESTAQUE */}
            <div
              ref={tracksSectionRef}
              className="mb-6 flex flex-wrap items-end justify-between gap-3 scroll-mt-4"
            >
              <h2 className="text-2xl font-bold text-white">
                Faixas em Destaque
              </h2>
              {loadedCount > 0 && (
                <p className="flex items-center gap-2 text-sm text-gray-400">
                  {isLoadingTracks && (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-cyan-400"
                      strokeWidth={ICON_STROKE}
                    />
                  )}
                  {showAllTracks
                    ? `Mostrando 1–${loadedCount} de ${displayTrackCount} músicas`
                    : `Mostrando ${startIndex + 1}–${Math.min(endIndex, allTracks.length)} de ${displayTrackCount} músicas`}
                </p>
              )}
            </div>

            {loadedCount > 0 ? (
              <>
                <div className="flex flex-col gap-2">
                  {visibleTracks.map((track, index) => (
                    <TrackRow
                      key={`${track.id}-${startIndex + index}`}
                      track={track}
                      index={startIndex + index}
                      variant="featured"
                      artistsFallback={artist.name}
                      onPlay={() => handlePlayTrack(track)}
                    />
                  ))}
                </div>

                {showPagination && (
                  <div className="mt-6 flex flex-col items-center gap-3">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => goToPage(safePage - 1)}
                        disabled={safePage <= 1}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft
                          className="h-4 w-4"
                          strokeWidth={ICON_STROKE}
                        />
                        Anterior
                      </button>

                      {pageNumbers.map((page, idx) => {
                        const prev = pageNumbers[idx - 1]
                        const showEllipsis =
                          prev != null && page - prev > 1
                        const isActive = page === safePage

                        return (
                          <span key={page} className="contents">
                            {showEllipsis && (
                              <span className="px-1 text-sm text-gray-500">
                                …
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => goToPage(page)}
                              className={`min-w-9 rounded-full px-3 py-2 text-sm transition-all ${
                                isActive
                                  ? 'bg-cyan-400 font-bold text-[#080B12] shadow-[0_0_15px_rgba(34,211,238,0.4)]'
                                  : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                              }`}
                            >
                              {page}
                            </button>
                          </span>
                        )
                      })}

                      <button
                        type="button"
                        onClick={() => goToPage(safePage + 1)}
                        disabled={safePage >= totalPages}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Próxima
                        <ChevronRight
                          className="h-4 w-4"
                          strokeWidth={ICON_STROKE}
                        />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAllTracks(true)
                        scrollToTracksSection()
                      }}
                      className="text-xs font-medium text-gray-500 transition-colors hover:text-cyan-400"
                    >
                      Ver todas
                    </button>
                  </div>
                )}

                {showAllTracks && loadedCount > TRACKS_PER_PAGE && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllTracks(false)
                        setCurrentPage(1)
                        scrollToTracksSection()
                      }}
                      className="text-xs font-medium text-gray-500 transition-colors hover:text-cyan-400"
                    >
                      Paginar lista
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-400">
                {isLoadingTracks
                  ? 'A carregar músicas…'
                  : 'Nenhuma faixa em destaque encontrada.'}
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
                    {displayTrackCount}
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

              {artist.location ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} />
                  {artist.location}
                </p>
              ) : null}

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
