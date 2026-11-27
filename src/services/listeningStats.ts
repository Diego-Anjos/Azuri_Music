import {
  getLikedTracks,
  getRecentPlays,
  type LikedTrackEntry,
} from './libraryStorage'
import { getUserProfile } from './userProfileService'

export const LISTENING_SESSIONS_KEY = 'azuri_listening_sessions_v1'
export const LISTENING_STATS_UPDATED_EVENT = 'azuri-listening-stats-updated'

export type ListeningPeriod = 'day' | 'week' | 'month' | 'year'

export type ListeningSession = {
  id: string
  trackId: string
  title: string
  artist: string
  artistId: string
  cover: string
  genre: string
  secondsListened: number
  timestamp: number
}

export type TimeSeriesPoint = {
  key: string
  label: string
  seconds: number
}

export type GenreStat = {
  genre: string
  seconds: number
  percent: number
  minutes: number
}

export type ArtistStat = {
  artistId: string
  artist: string
  cover: string
  plays: number
  seconds: number
}

export type TrackStat = {
  trackId: string
  title: string
  artist: string
  artistId: string
  cover: string
  plays: number
  seconds: number
}

export type PeakSlot = 'Madrugada' | 'Manhã' | 'Tarde' | 'Noite'

export type ListeningStats = {
  period: ListeningPeriod
  totalSeconds: number
  formattedTime: string
  tracksPlayed: number
  percentChange: number
  series: TimeSeriesPoint[]
  genres: GenreStat[]
  topArtists: ArtistStat[]
  topTracks: TrackStat[]
  peakSlot: PeakSlot
  streakDays: number
  topArtist: ArtistStat | null
}

type TrackSeed = {
  trackId: string
  title: string
  artist: string
  artistId: string
  cover: string
  genre: string
}

const FALLBACK_GENRES = [
  'Synthwave',
  'Hip-Hop / Rap',
  'Trap & Underground',
  'Eletrônica / House',
  'Lo-Fi Beats',
  'Indie / Alternativo',
  'R&B / Soul',
  'Pop',
]

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

function emitUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LISTENING_STATS_UPDATED_EVENT))
  }
}

function uid(): string {
  return `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(secs / 3600)
  const minutes = Math.floor((secs % 3600) / 60)
  if (hours <= 0) return `${minutes}m`
  if (minutes <= 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function slotForHour(hour: number): PeakSlot {
  if (hour < 6) return 'Madrugada'
  if (hour < 12) return 'Manhã'
  if (hour < 18) return 'Tarde'
  return 'Noite'
}

function pickGenre(seed: string, favorites: string[]): string {
  const pool = favorites.length > 0 ? favorites : FALLBACK_GENRES
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return pool[hash % pool.length] ?? FALLBACK_GENRES[0]
}

function isValidSession(value: unknown): value is ListeningSession {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ListeningSession>
  return (
    typeof item.id === 'string' &&
    typeof item.trackId === 'string' &&
    typeof item.title === 'string' &&
    typeof item.artist === 'string' &&
    typeof item.secondsListened === 'number' &&
    typeof item.timestamp === 'number'
  )
}

export function getListeningSessions(): ListeningSession[] {
  try {
    const raw = localStorage.getItem(LISTENING_SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidSession)
  } catch {
    return []
  }
}

function writeSessions(sessions: ListeningSession[]) {
  const trimmed = sessions
    .filter((s) => s.secondsListened > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 4000)
  localStorage.setItem(LISTENING_SESSIONS_KEY, JSON.stringify(trimmed))
  emitUpdated()
}

function collectSeedTracks(): TrackSeed[] {
  const favorites = getUserProfile().favoriteGenres
  const liked = getLikedTracks()
  const recent = getRecentPlays(40).filter(
    (item): item is Extract<typeof item, { kind: 'track' }> =>
      item.kind === 'track',
  )

  const map = new Map<string, TrackSeed>()

  const pushLiked = (track: LikedTrackEntry) => {
    const artist = track.artists?.[0]
    const artistName = artist?.name ?? 'Artista'
    const artistId = artist?.id || `name:${artistName.toLowerCase()}`
    map.set(track.id, {
      trackId: track.id,
      title: track.name,
      artist: artistName,
      artistId,
      cover: track.album?.images?.[0]?.url ?? '',
      genre: pickGenre(track.id + track.name, favorites),
    })
  }

  for (const track of liked) pushLiked(track)

  for (const play of recent) {
    if (map.has(play.id)) continue
    const artist = play.artists?.[0]
    const artistName = artist?.name ?? 'Artista'
    map.set(play.id, {
      trackId: play.id,
      title: play.name,
      artist: artistName,
      artistId: artist?.id || `name:${artistName.toLowerCase()}`,
      cover: play.imageUrl || play.album?.images?.[0]?.url || '',
      genre: pickGenre(play.id + play.name, favorites),
    })
  }

  if (map.size === 0) {
    const defaults = [
      {
        trackId: 'seed-neon-pulse',
        title: 'Neon Pulse',
        artist: 'Azuri Collective',
        cover: 'https://picsum.photos/seed/pulse-1/300/300',
      },
      {
        trackId: 'seed-midnight-drive',
        title: 'Midnight Drive',
        artist: 'Cyan Skies',
        cover: 'https://picsum.photos/seed/pulse-2/300/300',
      },
      {
        trackId: 'seed-glass-city',
        title: 'Glass City',
        artist: 'Echo Harbor',
        cover: 'https://picsum.photos/seed/pulse-3/300/300',
      },
      {
        trackId: 'seed-afterglow',
        title: 'Afterglow',
        artist: 'Lumen Waves',
        cover: 'https://picsum.photos/seed/pulse-4/300/300',
      },
      {
        trackId: 'seed-low-orbit',
        title: 'Low Orbit',
        artist: 'Nova Grid',
        cover: 'https://picsum.photos/seed/pulse-5/300/300',
      },
    ]
    for (const item of defaults) {
      map.set(item.trackId, {
        ...item,
        artistId: `name:${item.artist.toLowerCase()}`,
        genre: pickGenre(item.trackId, favorites),
      })
    }
  }

  return Array.from(map.values())
}

/** Base realista na 1ª abertura — espalhada em dia/semana/mês/ano. */
export function ensureListeningSeed(): ListeningSession[] {
  const existing = getListeningSessions()
  if (existing.length > 0) return existing

  const seeds = collectSeedTracks()
  const now = Date.now()
  const sessions: ListeningSession[] = []

  const pushAt = (
    track: TrackSeed,
    offsetMs: number,
    seconds: number,
  ) => {
    sessions.push({
      id: uid(),
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      cover: track.cover,
      genre: track.genre,
      secondsListened: Math.max(20, Math.floor(seconds)),
      timestamp: now - offsetMs,
    })
  }

  // Hoje — várias horas
  for (let h = 0; h < 16; h++) {
    const track = seeds[h % seeds.length]
    const hour = (new Date().getHours() - h + 24) % 24
    const base = startOfDay(new Date()).getTime() + hour * 3600_000
    pushAt(track, now - base, 180 + (h % 5) * 90)
  }

  // Esta semana
  for (let d = 1; d <= 6; d++) {
    for (let i = 0; i < 4; i++) {
      const track = seeds[(d * 3 + i) % seeds.length]
      pushAt(track, d * 86_400_000 + i * 3_600_000, 240 + i * 60)
    }
  }

  // Este mês
  for (let d = 8; d <= 26; d += 2) {
    for (let i = 0; i < 3; i++) {
      const track = seeds[(d + i) % seeds.length]
      pushAt(track, d * 86_400_000 + i * 2_400_000, 300 + (i % 4) * 80)
    }
  }

  // Este ano (meses anteriores)
  for (let m = 1; m <= 10; m++) {
    for (let i = 0; i < 5; i++) {
      const track = seeds[(m * 2 + i) % seeds.length]
      pushAt(
        track,
        m * 30 * 86_400_000 + i * 86_400_000,
        420 + i * 100,
      )
    }
  }

  writeSessions(sessions)
  return sessions
}

type TrackLikeInput = {
  id: string
  name: string
  artists?: Array<{ id?: string; name?: string }>
  album?: { images?: Array<{ url: string }> | null } | null
}

/** Acumula segundos ouvidos (chamado pelo PlayerContext a cada tick). */
export function appendListeningSeconds(
  track: TrackLikeInput,
  seconds: number,
): void {
  if (!track?.id || !(seconds > 0)) return
  ensureListeningSeed()

  const favorites = getUserProfile().favoriteGenres
  const artist = track.artists?.[0]
  const artistName = artist?.name?.trim() || 'Artista'
  const artistId = artist?.id?.trim() || `name:${artistName.toLowerCase()}`
  const cover = track.album?.images?.[0]?.url ?? ''
  const now = Date.now()

  const sessions = getListeningSessions()
  const recent = sessions[0]
  const mergeWindowMs = 2 * 60_000

  if (
    recent &&
    recent.trackId === track.id &&
    now - recent.timestamp < mergeWindowMs
  ) {
    recent.secondsListened += Math.floor(seconds)
    recent.timestamp = now
    recent.title = track.name
    recent.artist = artistName
    recent.artistId = artistId
    if (cover) recent.cover = cover
    writeSessions(sessions)
    return
  }

  sessions.unshift({
    id: uid(),
    trackId: track.id,
    title: track.name,
    artist: artistName,
    artistId,
    cover,
    genre: pickGenre(track.id + track.name, favorites),
    secondsListened: Math.floor(seconds),
    timestamp: now,
  })
  writeSessions(sessions)
}

function periodBounds(period: ListeningPeriod, now = new Date()) {
  const end = now.getTime()
  let start: number
  let prevStart: number
  let prevEnd: number

  switch (period) {
    case 'day': {
      start = startOfDay(now).getTime()
      prevEnd = start
      prevStart = addDays(startOfDay(now), -1).getTime()
      break
    }
    case 'week': {
      start = startOfWeek(now).getTime()
      prevEnd = start
      prevStart = addDays(startOfWeek(now), -7).getTime()
      break
    }
    case 'month': {
      start = startOfMonth(now).getTime()
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      prevStart = prevMonth.getTime()
      prevEnd = start
      break
    }
    case 'year':
    default: {
      start = startOfYear(now).getTime()
      prevStart = new Date(now.getFullYear() - 1, 0, 1).getTime()
      prevEnd = start
      break
    }
  }

  return { start, end, prevStart, prevEnd }
}

function inRange(ts: number, start: number, end: number) {
  return ts >= start && ts <= end
}

function buildSeries(
  period: ListeningPeriod,
  sessions: ListeningSession[],
  now = new Date(),
): TimeSeriesPoint[] {
  if (period === 'day') {
    const points: TimeSeriesPoint[] = Array.from({ length: 24 }, (_, hour) => ({
      key: `h-${hour}`,
      label: `${String(hour).padStart(2, '0')}h`,
      seconds: 0,
    }))
    const dayStart = startOfDay(now).getTime()
    for (const s of sessions) {
      if (!inRange(s.timestamp, dayStart, now.getTime())) continue
      const hour = new Date(s.timestamp).getHours()
      points[hour].seconds += s.secondsListened
    }
    return points
  }

  if (period === 'week') {
    const weekStart = startOfWeek(now)
    const points: TimeSeriesPoint[] = WEEKDAY_LABELS.map((label, i) => ({
      key: `d-${i}`,
      label,
      seconds: 0,
    }))
    for (const s of sessions) {
      if (!inRange(s.timestamp, weekStart.getTime(), now.getTime())) continue
      const day = new Date(s.timestamp)
      const idx = (day.getDay() + 6) % 7
      points[idx].seconds += s.secondsListened
    }
    return points
  }

  if (period === 'month') {
    const monthStart = startOfMonth(now)
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate()
    const points: TimeSeriesPoint[] = Array.from(
      { length: daysInMonth },
      (_, i) => ({
        key: `day-${i + 1}`,
        label: String(i + 1),
        seconds: 0,
      }),
    )
    for (const s of sessions) {
      if (!inRange(s.timestamp, monthStart.getTime(), now.getTime())) continue
      const day = new Date(s.timestamp).getDate()
      points[day - 1].seconds += s.secondsListened
    }
    return points
  }

  const yearStart = startOfYear(now)
  const points: TimeSeriesPoint[] = MONTH_LABELS.map((label, i) => ({
    key: `m-${i}`,
    label,
    seconds: 0,
  }))
  for (const s of sessions) {
    if (!inRange(s.timestamp, yearStart.getTime(), now.getTime())) continue
    const month = new Date(s.timestamp).getMonth()
    points[month].seconds += s.secondsListened
  }
  return points
}

function rankGenres(sessions: ListeningSession[]): GenreStat[] {
  const map = new Map<string, number>()
  let total = 0
  for (const s of sessions) {
    const genre = s.genre || 'Outros'
    map.set(genre, (map.get(genre) ?? 0) + s.secondsListened)
    total += s.secondsListened
  }
  return Array.from(map.entries())
    .map(([genre, seconds]) => ({
      genre,
      seconds,
      minutes: Math.round(seconds / 60),
      percent: total > 0 ? Math.round((seconds / total) * 100) : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8)
}

function rankArtists(sessions: ListeningSession[]): ArtistStat[] {
  const map = new Map<string, ArtistStat>()
  for (const s of sessions) {
    const key = s.artistId || s.artist
    const existing = map.get(key)
    if (existing) {
      existing.seconds += s.secondsListened
      existing.plays += 1
      if (s.cover) existing.cover = s.cover
    } else {
      map.set(key, {
        artistId: s.artistId || key,
        artist: s.artist,
        cover: s.cover,
        plays: 1,
        seconds: s.secondsListened,
      })
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5)
}

function rankTracks(sessions: ListeningSession[]): TrackStat[] {
  const map = new Map<string, TrackStat>()
  for (const s of sessions) {
    const existing = map.get(s.trackId)
    if (existing) {
      existing.seconds += s.secondsListened
      existing.plays += 1
      if (s.cover) existing.cover = s.cover
    } else {
      map.set(s.trackId, {
        trackId: s.trackId,
        title: s.title,
        artist: s.artist,
        artistId: s.artistId,
        cover: s.cover,
        plays: 1,
        seconds: s.secondsListened,
      })
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5)
}

function peakSlotFromSessions(sessions: ListeningSession[]): PeakSlot {
  const buckets: Record<PeakSlot, number> = {
    Madrugada: 0,
    Manhã: 0,
    Tarde: 0,
    Noite: 0,
  }
  for (const s of sessions) {
    buckets[slotForHour(new Date(s.timestamp).getHours())] +=
      s.secondsListened
  }
  return (Object.entries(buckets) as Array<[PeakSlot, number]>).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] ?? 'Noite'
}

function computeStreak(sessions: ListeningSession[], now = new Date()): number {
  const days = new Set(
    sessions.map((s) => startOfDay(new Date(s.timestamp)).getTime()),
  )
  let cursor = startOfDay(now)
  if (!days.has(cursor.getTime())) {
    cursor = addDays(cursor, -1)
  }
  let streak = 0
  while (days.has(cursor.getTime())) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function getListeningStats(period: ListeningPeriod): ListeningStats {
  const sessions = ensureListeningSeed()
  const now = new Date()
  const { start, end, prevStart, prevEnd } = periodBounds(period, now)

  const current = sessions.filter((s) => inRange(s.timestamp, start, end))
  const previous = sessions.filter((s) =>
    inRange(s.timestamp, prevStart, prevEnd),
  )

  const totalSeconds = current.reduce((sum, s) => sum + s.secondsListened, 0)
  const prevSeconds = previous.reduce((sum, s) => sum + s.secondsListened, 0)
  const percentChange =
    prevSeconds <= 0
      ? totalSeconds > 0
        ? 100
        : 0
      : Math.round(((totalSeconds - prevSeconds) / prevSeconds) * 100)

  const uniqueTracks = new Set(current.map((s) => s.trackId)).size
  const topArtists = rankArtists(current)
  const topTracks = rankTracks(current)

  return {
    period,
    totalSeconds,
    formattedTime: formatDuration(totalSeconds),
    tracksPlayed: uniqueTracks,
    percentChange,
    series: buildSeries(period, current, now),
    genres: rankGenres(current),
    topArtists,
    topTracks,
    peakSlot: peakSlotFromSessions(current),
    streakDays: computeStreak(sessions, now),
    topArtist: topArtists[0] ?? null,
  }
}

export function formatListeningClock(seconds: number): string {
  return formatDuration(seconds)
}

export function subscribeListeningStats(
  listener: () => void,
): () => void {
  ensureListeningSeed()
  window.addEventListener(LISTENING_STATS_UPDATED_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(LISTENING_STATS_UPDATED_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
