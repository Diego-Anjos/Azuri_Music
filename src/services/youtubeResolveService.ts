import { getAudioSettings } from './audioSettingsService'

const RESOLVE_URL = 'http://localhost:3001/api/stream/resolve'
const STREAM_BASE = 'http://localhost:3001/api/stream'
const YT_CACHE_PREFIX_V2 = 'azuri_yt_cache_v2_'
const YT_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7
const DURATION_TOLERANCE_SEC = 15

export type YoutubeResolveTrack = {
  id?: string
  name: string
  artists?: Array<{ name?: string }>
  duration_ms?: number
}

type ResolveResponse = {
  videoId?: string
  title?: string
  duration?: number
  source?: string
  score?: number
}

type CacheEntry = {
  videoId: string
  title?: string
  duration?: number
  at: number
}

let legacyCacheCleared = false

function clearLegacyYoutubeCaches() {
  if (legacyCacheCleared || typeof localStorage === 'undefined') return
  legacyCacheCleared = true
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      // Remove caches antigos sem o prefixo v2
      if (
        (key.startsWith('azuri_yt_cache_') && !key.startsWith(YT_CACHE_PREFIX_V2)) ||
        key.startsWith('azuri_youtube_cache_')
      ) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    // ignore quota / privacy mode
  }
}

function normalizeMatchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(
      /\b(official\s*(audio|video|music\s*video|lyric\s*video)?|lyrics?|audio|visuali[sz]er|topic|hd|4k|mv|prod\.?|feat\.?|ft\.?)\b/gi,
      ' ',
    )
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleKeywordsPresent(expected: string, candidate: string): boolean {
  const expectedTokens = normalizeMatchText(expected)
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  if (expectedTokens.length === 0) return true
  const candidateNorm = normalizeMatchText(candidate)
  const significant = expectedTokens.filter(
    (t) => t.length >= 3 || expectedTokens.length <= 2,
  )
  if (significant.length === 0) return true
  const hits = significant.filter((t) => candidateNorm.includes(t))
  return hits.length >= Math.ceil(significant.length * 0.7)
}

function artistCompatible(expectedArtist: string, haystack: string): boolean {
  const expected = normalizeMatchText(expectedArtist)
  const candidate = normalizeMatchText(haystack)
  if (!expected || !candidate) return false
  if (candidate.includes(expected) || expected.includes(candidate)) return true
  const tokens = expected.split(/\s+/).filter((t) => t.length >= 3)
  return tokens.some((t) => candidate.includes(t))
}

function durationWithinTolerance(
  expectedSec: number,
  candidateSec: number | undefined,
): boolean {
  if (!(expectedSec > 0)) return true
  if (!(candidateSec && candidateSec > 0)) return true
  return Math.abs(candidateSec - expectedSec) <= DURATION_TOLERANCE_SEC
}

function cacheKey(track: YoutubeResolveTrack): string {
  const artist = track.artists?.[0]?.name ?? ''
  const title = track.name ?? ''
  const duration =
    track.duration_ms && track.duration_ms > 0
      ? Math.round(track.duration_ms / 1000)
      : 0
  return `${YT_CACHE_PREFIX_V2}${encodeURIComponent(
    `${artist}::${title}::${duration}`.toLowerCase(),
  )}`
}

function readCache(track: YoutubeResolveTrack): string | null {
  clearLegacyYoutubeCaches()
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(cacheKey(track))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!parsed?.videoId) return null
    if (Date.now() - (parsed.at || 0) > YT_CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(track))
      return null
    }
    const expectedSec =
      track.duration_ms && track.duration_ms > 0
        ? track.duration_ms / 1000
        : 0
    if (!durationWithinTolerance(expectedSec, parsed.duration)) {
      localStorage.removeItem(cacheKey(track))
      return null
    }
    return parsed.videoId
  } catch {
    return null
  }
}

function writeCache(
  track: YoutubeResolveTrack,
  data: { videoId: string; title?: string; duration?: number },
) {
  if (typeof localStorage === 'undefined') return
  try {
    const entry: CacheEntry = {
      videoId: data.videoId,
      title: data.title,
      duration: data.duration,
      at: Date.now(),
    }
    localStorage.setItem(cacheKey(track), JSON.stringify(entry))
  } catch {
    // ignore
  }
}

function isValidResolveMatch(
  track: YoutubeResolveTrack,
  data: ResolveResponse,
): boolean {
  if (!data.videoId) return false

  const expectedTitle = track.name ?? ''
  const expectedArtist = track.artists?.[0]?.name ?? ''
  const expectedSec =
    track.duration_ms && track.duration_ms > 0
      ? track.duration_ms / 1000
      : 0

  if (data.title && expectedTitle) {
    if (!titleKeywordsPresent(expectedTitle, data.title)) return false
  }

  if (data.title && expectedArtist) {
    if (
      !artistCompatible(expectedArtist, data.title) &&
      !artistCompatible(expectedArtist, expectedTitle)
    ) {
      // Título do vídeo sem artista ainda pode ser ok se o score do server for alto
      // e a duração bater — só rejeita se duração também falhar
      if (!durationWithinTolerance(expectedSec, data.duration)) return false
    }
  }

  if (!durationWithinTolerance(expectedSec, data.duration)) return false

  return true
}

function buildResolveSearchParams(track: YoutubeResolveTrack): URLSearchParams {
  const artist = track.artists?.[0]?.name ?? ''
  const title = track.name ?? ''
  const query = `${title} ${artist}`.trim()
  const quality = getAudioSettings().quality
  const params = new URLSearchParams()
  params.set('query', query)
  if (title) params.set('title', title)
  if (artist) params.set('artist', artist)
  if (track.duration_ms && track.duration_ms > 0) {
    params.set('duration', String(Math.round(track.duration_ms / 1000)))
  }
  params.set('quality', quality)
  return params
}

/**
 * Resolve videoId YouTube/SoundCloud com validação de título + artista + duração (±15s).
 * Cache local: azuri_yt_cache_v2_
 */
export async function resolveYoutubeVideoId(
  track: YoutubeResolveTrack,
  signal?: AbortSignal,
): Promise<string | null> {
  clearLegacyYoutubeCaches()

  const cached = readCache(track)
  if (cached) return cached

  const params = buildResolveSearchParams(track)

  try {
    const response = await fetch(`${RESOLVE_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    })

    let data: ResolveResponse | null = null

    if (response.ok) {
      data = (await response.json()) as ResolveResponse
    } else {
      const legacy = await fetch(
        `${STREAM_BASE}?${params.toString()}&resolve=1`,
        { headers: { Accept: 'application/json' }, signal },
      )
      if (!legacy.ok) {
        console.error('Falha ao resolver vídeo:', response.status)
        return null
      }
      data = (await legacy.json()) as ResolveResponse
    }

    if (!data?.videoId) {
      console.error('Resposta sem videoId')
      return null
    }

    if (!isValidResolveMatch(track, data)) {
      console.warn(
        '[yt-fallback] Candidato rejeitado por título/artista/duração:',
        data.title,
        data.duration,
      )
      return null
    }

    writeCache(track, {
      videoId: data.videoId,
      title: data.title,
      duration: data.duration,
    })

    return data.videoId
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') return null
    console.error('Erro ao resolver vídeo no YouTube:', error)
    return null
  }
}
