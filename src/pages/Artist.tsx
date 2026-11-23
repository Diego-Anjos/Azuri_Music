import { ChevronDown, ChevronUp, Loader2, MapPin, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { TrackRow } from '../components/TrackRow'
import {
  getArtistProfile,
  searchArtistTracksPage,
  type ArtistProfile,
  type ArtistProfileTrack,
} from '../services/spotify'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5
const INITIAL_VISIBLE = 5
const PAGE_SIZE = 10

type ArtistLocationState = {
  artistName?: string
}

function mergeUniqueTracks(
  current: ArtistProfileTrack[],
  incoming: ArtistProfileTrack[],
): ArtistProfileTrack[] {
  const seen = new Set(current.map((t) => t.id))
  const merged = [...current]
  for (const track of incoming) {
    if (!seen.has(track.id)) {
      seen.add(track.id)
      merged.push(track)
    }
  }
  return merged
}

function isValidHttpsUrl(url: string | null | undefined): url is string {
  return Boolean(url && /^https:\/\//i.test(url.trim()))
}

function getAlbumFallback(artist: ArtistProfile): string | null {
  // ArtistProfileAlbum usa imageUrl (não images[])
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
  const [loadedTracks, setLoadedTracks] = useState<ArtistProfileTrack[]>([])
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [tracksOffset, setTracksOffset] = useState(0)
  const [hasMoreTracks, setHasMoreTracks] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isBioExpanded, setIsBioExpanded] = useState(false)
  const [bannerSrc, setBannerSrc] = useState<string | null>(null)
  const [isOfficialBanner, setIsOfficialBanner] = useState(false)

  useEffect(() => {
    async function loadData() {
      if (!id) return
      setLoading(true)
      setIsBioExpanded(false)
      setBannerSrc(null)
      setIsOfficialBanner(false)
      setLoadedTracks([])
      setVisibleCount(INITIAL_VISIBLE)
      setTracksOffset(0)
      setHasMoreTracks(true)

      const data = await getArtistProfile(id, artistName || undefined)
      setArtist(data)

      if (data) {
        const initial = data.topTracks ?? []
        setLoadedTracks(initial)
        setVisibleCount(Math.min(INITIAL_VISIBLE, initial.length))
        setTracksOffset(initial.length)
        setHasMoreTracks(initial.length > 0)
        const resolved = resolveInitialBanner(data)
        setBannerSrc(resolved.src)
        setIsOfficialBanner(resolved.isOfficial)
      }

      setLoading(false)
    }

    void loadData()
  }, [id, artistName])

  const avatarUrl = artist?.images?.[0]?.url
  const visibleTracks = loadedTracks.slice(0, visibleCount)
  const isExpanded = visibleCount > INITIAL_VISIBLE

  async function handleLoadMoreTracks() {
    if (!artist || isLoadingMore) return

    // Já há faixas carregadas além do compacto — só expandir
    if (visibleCount < loadedTracks.length) {
      setVisibleCount(loadedTracks.length)
      return
    }

    if (!hasMoreTracks) return

    setIsLoadingMore(true)
    try {
      const page = await searchArtistTracksPage(
        artist.name,
        artist.id,
        tracksOffset,
        PAGE_SIZE,
      )
      const merged = mergeUniqueTracks(loadedTracks, page.tracks)
      setLoadedTracks(merged)
      setTracksOffset(page.nextOffset)
      // Sem resultados filtrados nesta página → não insistir; senão confiar no hasMore da API
      setHasMoreTracks(page.tracks.length > 0 ? page.hasMore : false)
      setVisibleCount(merged.length)
    } finally {
      setIsLoadingMore(false)
    }
  }

  function handleShowLessTracks() {
    setVisibleCount(Math.min(INITIAL_VISIBLE, loadedTracks.length))
  }

  function handlePlayTrack(track: ArtistProfileTrack) {
    if (!artist) return
    void playTrack(track, loadedTracks.length > 0 ? loadedTracks : artist.topTracks)
  }

  function handlePlayAll() {
    const queue = loadedTracks.length > 0 ? loadedTracks : artist?.topTracks ?? []
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

        {/* Gradiente suave — capa nítida, texto legível */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/40 to-black/30" />

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

      {/* 2. GRID PRINCIPAL DE CONTEÚDO */}
      <div className="mx-auto max-w-[1600px] p-6 md:p-10">
        <div className="grid grid-cols-1 gap-8 md:gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* 1. FAIXAS EM DESTAQUE */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-bold text-white">
                Faixas em Destaque
              </h2>
              {loadedTracks.length > 0 && (
                <p className="text-sm text-gray-400">
                  Mostrando {visibleTracks.length}{' '}
                  {visibleTracks.length === 1 ? 'música' : 'músicas'}
                  {loadedTracks.length > visibleTracks.length
                    ? ` · ${loadedTracks.length} carregadas`
                    : null}
                </p>
              )}
            </div>

            {loadedTracks.length > 0 ? (
              <>
                <div className="flex flex-col gap-2">
                  {visibleTracks.map((track, index) => (
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

                <div className="mt-4 flex flex-col items-center gap-2">
                  {(hasMoreTracks || visibleCount < loadedTracks.length) && (
                    <button
                      type="button"
                      onClick={() => void handleLoadMoreTracks()}
                      disabled={isLoadingMore}
                      className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-gray-200 transition-all hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            strokeWidth={ICON_STROKE}
                          />
                          A carregar…
                        </>
                      ) : (
                        <>
                          <ChevronDown
                            className="h-4 w-4"
                            strokeWidth={ICON_STROKE}
                          />
                          Carregar mais músicas
                        </>
                      )}
                    </button>
                  )}

                  {isExpanded && (
                    <button
                      type="button"
                      onClick={handleShowLessTracks}
                      className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300"
                    >
                      <ChevronUp
                        className="h-3.5 w-3.5"
                        strokeWidth={ICON_STROKE}
                      />
                      Mostrar menos
                    </button>
                  )}
                </div>
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
