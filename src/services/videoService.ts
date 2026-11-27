const VIDEO_API = 'http://localhost:3001/api/video'
const CACHE_PREFIX = 'azuri_video_v2_'
const PIN_PREFIX = 'azuri_video_pin_v2_'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3

export type OfficialVideoAlternative = {
  videoId: string
  title: string
  channel?: string
  thumbnail: string
  isOfficialClip: boolean
}

export type OfficialVideoResult = {
  videoId: string
  title: string
  channel?: string
  thumbnail: string
  isOfficialClip: boolean
  alternatives: OfficialVideoAlternative[]
}

type CacheEntry = {
  result: OfficialVideoResult
  at: number
}

export function extractYoutubeVideoId(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (/^[\w-]{11}$/.test(value)) return value

  try {
    const url = new URL(value)
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace(/^\//, '').slice(0, 11)
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    const v = url.searchParams.get('v')
    if (v && /^[\w-]{11}$/.test(v)) return v
    const embed = url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/)
    if (embed?.[1]) return embed[1]
  } catch {
    // ignore invalid URL
  }
  return null
}

function cacheKey(title: string, artist: string, durationSec: number) {
  return `${CACHE_PREFIX}${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}::${Math.round(durationSec || 0)}`
}

function pinKey(title: string, artist: string) {
  return `${PIN_PREFIX}${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`
}

function readCache(key: string): OfficialVideoResult | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!parsed?.result?.videoId) return null
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null
    return {
      ...parsed.result,
      isOfficialClip: parsed.result.isOfficialClip !== false,
      alternatives: Array.isArray(parsed.result.alternatives)
        ? parsed.result.alternatives
        : [],
    }
  } catch {
    return null
  }
}

function writeCache(key: string, result: OfficialVideoResult) {
  try {
    const entry: CacheEntry = { result, at: Date.now() }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // ignore quota
  }
}

/** Clipe fixado manualmente pelo utilizador para a faixa. */
export function readPinnedVideoId(title: string, artist: string): string | null {
  try {
    const raw = localStorage.getItem(pinKey(title, artist))
    if (!raw) return null
    return extractYoutubeVideoId(raw)
  } catch {
    return null
  }
}

export function writePinnedVideoId(
  title: string,
  artist: string,
  videoId: string,
) {
  try {
    localStorage.setItem(pinKey(title, artist), videoId)
  } catch {
    // ignore quota
  }
}

export function clearPinnedVideoId(title: string, artist: string) {
  try {
    localStorage.removeItem(pinKey(title, artist))
  } catch {
    // ignore
  }
}

export async function resolveOfficialMusicVideo(input: {
  title: string
  artist: string
  durationSec?: number
  signal?: AbortSignal
}): Promise<OfficialVideoResult | null> {
  const title = input.title.trim()
  const artist = input.artist.trim()
  if (!title) return null

  const pinned = readPinnedVideoId(title, artist)
  const durationSec =
    input.durationSec && input.durationSec > 0 ? input.durationSec : 0
  const key = cacheKey(title, artist, durationSec)
  const cached = readCache(key)

  if (cached && !pinned) return cached

  let result: OfficialVideoResult | null = cached

  if (!result) {
    const params = new URLSearchParams()
    params.set('title', title)
    if (artist) params.set('artist', artist)
    if (durationSec > 0) params.set('duration', String(Math.round(durationSec)))

    const res = await fetch(`${VIDEO_API}?${params.toString()}`, {
      signal: input.signal,
    })
    if (!res.ok) {
      if (!pinned) return null
      return {
        videoId: pinned,
        title,
        thumbnail: `https://i.ytimg.com/vi/${pinned}/hqdefault.jpg`,
        isOfficialClip: true,
        alternatives: [],
      }
    }

    const data = (await res.json()) as Partial<OfficialVideoResult>
    if (!data.videoId) {
      if (!pinned) return null
      return {
        videoId: pinned,
        title,
        thumbnail: `https://i.ytimg.com/vi/${pinned}/hqdefault.jpg`,
        isOfficialClip: true,
        alternatives: [],
      }
    }

    result = {
      videoId: data.videoId,
      title: data.title ?? title,
      channel: data.channel,
      thumbnail:
        data.thumbnail ?? `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg`,
      isOfficialClip: data.isOfficialClip !== false,
      alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
    }
    writeCache(key, result)
  }

  if (pinned) {
    const fromAlts = result.alternatives.find((alt) => alt.videoId === pinned)
    const altPool = [
      {
        videoId: result.videoId,
        title: result.title,
        channel: result.channel,
        thumbnail: result.thumbnail,
        isOfficialClip: result.isOfficialClip,
      },
      ...result.alternatives.filter((alt) => alt.videoId !== pinned),
    ].filter((alt) => alt.videoId !== pinned)

    return {
      videoId: pinned,
      title: fromAlts?.title ?? result.title,
      channel: fromAlts?.channel ?? result.channel,
      thumbnail:
        fromAlts?.thumbnail ??
        `https://i.ytimg.com/vi/${pinned}/hqdefault.jpg`,
      isOfficialClip: fromAlts?.isOfficialClip ?? true,
      alternatives: altPool.slice(0, 4),
    }
  }

  return result
}
