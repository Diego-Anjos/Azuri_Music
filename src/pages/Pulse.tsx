import {
  Activity,
  Clock3,
  Disc3,
  Flame,
  Moon,
  Play,
  Sun,
  Sunrise,
  Sunset,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  formatListeningClock,
  getListeningStats,
  subscribeListeningStats,
  type ListeningPeriod,
  type ListeningStats,
  type PeakSlot,
  type TimeSeriesPoint,
} from '../services/listeningStats'
import { usePlayerStore, type PlayerTrack } from '../store/usePlayerStore'

const ICON_STROKE = 1.5

const PERIODS: { id: ListeningPeriod; label: string }[] = [
  { id: 'day', label: 'Hoje' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
]

const PEAK_META: Record<
  PeakSlot,
  { icon: typeof Moon; hint: string }
> = {
  Madrugada: { icon: Moon, hint: '00h – 06h' },
  Manhã: { icon: Sunrise, hint: '06h – 12h' },
  Tarde: { icon: Sun, hint: '12h – 18h' },
  Noite: { icon: Sunset, hint: '18h – 00h' },
}

function artistIdForNav(artistId: string, artistName: string): string {
  if (artistId && !artistId.startsWith('name:')) return artistId
  return encodeURIComponent(artistName)
}

export function Pulse() {
  const navigate = useNavigate()
  const playTrack = usePlayerStore((s) => s.playTrack)
  const [period, setPeriod] = useState<ListeningPeriod>('week')
  const [stats, setStats] = useState<ListeningStats>(() =>
    getListeningStats('week'),
  )

  useEffect(() => {
    setStats(getListeningStats(period))
    return subscribeListeningStats(() => {
      setStats(getListeningStats(period))
    })
  }, [period])

  const PeakIcon = PEAK_META[stats.peakSlot].icon

  function handlePlayTrack(track: ListeningStats['topTracks'][number]) {
    const playerTrack: PlayerTrack = {
      id: track.trackId,
      name: track.title,
      artists: [{ id: track.artistId, name: track.artist }],
      album: {
        images: track.cover ? [{ url: track.cover }] : null,
      },
    }
    void playTrack(playerTrack, [playerTrack])
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#070d14] pb-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.12),_transparent_60%)]" />

      <div className="relative mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8 md:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-cyan-300">
              <Activity className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              LIVE STATS
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50 md:text-4xl">
              Meu Pulso
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Sua frequência musical em tempo real
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-md">
            {PERIODS.map((item) => {
              const active = period === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPeriod(item.id)}
                  className={`cursor-pointer rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-cyan-400 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.35)]'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </header>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Tempo Ouvido"
            icon={Clock3}
            accent
          >
            <p className="text-3xl font-bold tracking-tight text-slate-50">
              {stats.formattedTime}
            </p>
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                stats.percentChange >= 0
                  ? 'bg-cyan-400/15 text-cyan-300'
                  : 'bg-rose-400/15 text-rose-300'
              }`}
            >
              <TrendingUp className="h-3 w-3" strokeWidth={ICON_STROKE} />
              {stats.percentChange >= 0 ? '+' : ''}
              {stats.percentChange}% vs período anterior
            </span>
          </KpiCard>

          <KpiCard label="Faixas Tocadas" icon={Disc3}>
            <p className="text-3xl font-bold tracking-tight text-slate-50">
              {stats.tracksPlayed}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              reproduções únicas no período
            </p>
          </KpiCard>

          <KpiCard label="Artista #1" icon={Users}>
            {stats.topArtist ? (
              <div className="flex items-center gap-3">
                {stats.topArtist.cover ? (
                  <img
                    src={stats.topArtist.cover}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-cyan-400/40"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-bold text-cyan-300 ring-2 ring-cyan-400/40">
                    {stats.topArtist.artist.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-slate-50">
                    {stats.topArtist.artist}
                  </p>
                  <p className="text-xs text-cyan-300/90">
                    {formatListeningClock(stats.topArtist.seconds)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Sem dados ainda</p>
            )}
          </KpiCard>

          <KpiCard label="Sequência & Horário Nobre" icon={Flame}>
            <p className="text-3xl font-bold tracking-tight text-slate-50">
              {stats.streakDays}{' '}
              <span className="text-base font-medium text-slate-400">
                {stats.streakDays === 1 ? 'dia' : 'dias'}
              </span>
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-cyan-300">
              <PeakIcon className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              {stats.peakSlot}
              <span className="text-slate-500">
                · {PEAK_META[stats.peakSlot].hint}
              </span>
            </p>
          </KpiCard>
        </div>

        {/* Activity chart */}
        <section className="rounded-3xl border border-cyan-400/15 bg-[#0a111a]/80 p-4 shadow-[0_0_40px_rgba(34,211,238,0.06)] backdrop-blur-xl sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-50">
                Atividade
              </h2>
              <p className="text-xs text-slate-400">
                Distribuição de escuta no período selecionado
              </p>
            </div>
          </div>
          <ActivityChart series={stats.series} />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* DNA Musical */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-5 xl:col-span-4">
            <h2 className="text-base font-semibold text-slate-50">
              DNA Musical
            </h2>
            <p className="mb-4 text-xs text-slate-400">
              Gêneros / estilos mais ouvidos
            </p>
            <div className="space-y-3">
              {stats.genres.length === 0 ? (
                <p className="text-sm text-slate-500">Sem gêneros no período</p>
              ) : (
                stats.genres.map((genre) => (
                  <div key={genre.genre}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-slate-200">
                        {genre.genre}
                      </span>
                      <span className="shrink-0 tabular-nums text-cyan-300">
                        {genre.percent}% · {genre.minutes}m
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-300 transition-all duration-700"
                        style={{ width: `${Math.max(4, genre.percent)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Rankings */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:col-span-8">
            <RankingCard title="Top Artistas">
              {stats.topArtists.map((artist, index) => (
                <li key={artist.artistId}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/artist/${artistIdForNav(artist.artistId, artist.artist)}`,
                      )
                    }
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
                  >
                    <span className="w-5 text-center text-xs font-bold text-cyan-400/80">
                      #{index + 1}
                    </span>
                    {artist.cover ? (
                      <img
                        src={artist.cover}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 text-xs font-bold text-cyan-300">
                        {artist.artist.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100 group-hover:text-cyan-200">
                        {artist.artist}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {artist.plays} plays ·{' '}
                        {formatListeningClock(artist.seconds)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </RankingCard>

            <RankingCard title="Top Músicas">
              {stats.topTracks.map((track, index) => (
                <li key={track.trackId}>
                  <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5">
                    <span className="w-5 text-center text-xs font-bold text-cyan-400/80">
                      #{index + 1}
                    </span>
                    {track.cover ? (
                      <img
                        src={track.cover}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-xs font-bold text-cyan-300">
                        {track.title.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {track.title}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {track.artist} · {formatListeningClock(track.seconds)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Tocar ${track.title}`}
                      onClick={() => handlePlayTrack(track)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300 opacity-100 transition-all hover:bg-cyan-400 hover:text-slate-950 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Play
                        className="h-3.5 w-3.5 translate-x-px"
                        strokeWidth={ICON_STROKE}
                        fill="currentColor"
                      />
                    </button>
                  </div>
                </li>
              ))}
            </RankingCard>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  icon: Icon,
  children,
  accent = false,
}: {
  label: string
  icon: typeof Clock3
  children: ReactNode
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-3xl border p-4 backdrop-blur-xl sm:p-5 ${
        accent
          ? 'border-cyan-400/25 bg-gradient-to-br from-cyan-500/15 via-[#0a111a]/90 to-[#0a111a]/90 shadow-[0_0_30px_rgba(34,211,238,0.1)]'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5 text-cyan-400" strokeWidth={ICON_STROKE} />
        {label}
      </div>
      {children}
    </div>
  )
}

function RankingCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-5">
      <h2 className="mb-3 text-base font-semibold text-slate-50">{title}</h2>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  )
}

function ActivityChart({ series }: { series: TimeSeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = useMemo(
    () => Math.max(1, ...series.map((p) => p.seconds)),
    [series],
  )

  const width = 640
  const height = 180
  const padX = 8
  const padY = 16
  const gap = series.length > 20 ? 2 : 6
  const barW =
    (width - padX * 2 - gap * Math.max(0, series.length - 1)) /
    Math.max(1, series.length)

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full sm:h-52"
        role="img"
        aria-label="Gráfico de atividade de escuta"
      >
        {series.map((point, index) => {
          const h = Math.max(
            2,
            ((point.seconds / max) * (height - padY * 2)) | 0,
          )
          const x = padX + index * (barW + gap)
          const y = height - padY - h
          const isPeak = point.seconds === max && point.seconds > 0
          const isHover = hover === index
          return (
            <g
              key={point.key}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer"
            >
              <rect
                x={x}
                y={y}
                width={Math.max(2, barW)}
                height={h}
                rx={Math.min(6, barW / 2)}
                fill={isPeak || isHover ? 'url(#pulseBarHot)' : 'url(#pulseBar)'}
                opacity={point.seconds > 0 ? 1 : 0.25}
                style={{
                  filter:
                    isPeak || isHover
                      ? 'drop-shadow(0 0 8px rgba(34,211,238,0.55))'
                      : undefined,
                }}
              />
            </g>
          )
        })}
        <defs>
          <linearGradient id="pulseBar" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgb(6,182,212)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(103,232,249)" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="pulseBarHot" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgb(8,145,178)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="rgb(165,243,252)" stopOpacity="1" />
          </linearGradient>
        </defs>
      </svg>

      {hover != null && series[hover] && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-cyan-400/30 bg-[#0a111a]/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl backdrop-blur-md">
          <span className="font-semibold text-cyan-300">
            {series[hover].label}
          </span>
          <span className="mx-1.5 text-slate-600">·</span>
          {formatListeningClock(series[hover].seconds)}
        </div>
      )}

      <div className="mt-1 flex justify-between gap-1 overflow-hidden px-1 text-[10px] text-slate-500">
        {series.length <= 12
          ? series.map((p) => (
              <span key={p.key} className="min-w-0 flex-1 truncate text-center">
                {p.label}
              </span>
            ))
          : (
            <>
              <span>{series[0]?.label}</span>
              <span>{series[Math.floor(series.length / 2)]?.label}</span>
              <span>{series[series.length - 1]?.label}</span>
            </>
          )}
      </div>
    </div>
  )
}
