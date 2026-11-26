import 'dotenv/config'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import cors from 'cors'
import express from 'express'
import play from 'play-dl'
import { handleAiLyricsSync } from './aiLyricsSync.js'
import {
  buildSearchVariants,
  cleanLyricsArtist,
  cleanLyricsTitle,
  durationClose,
  isArtistMatch,
  isStrictTrackMatch,
  isTranslationMetadata,
  isValidLyricsText,
  tokenSimilarity,
  type LyricsSearchVariant,
} from './utils/lyricsNormalizer.js'

// Garante server/.env mesmo se o cwd não for a pasta server/
loadDotenv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env'),
})

const app = express()
const PORT = Number(process.env.PORT) || 3001

const GEMINI_KEY_PLACEHOLDER = /COLE_SUA_CHAVE|sua_chave_aqui|your[_-]?key/i

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim() ?? ''
  return key.length > 0 && !GEMINI_KEY_PLACEHOLDER.test(key)
}

app.use(cors())
app.use(express.json({ limit: '2mb' }))

const SC_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Preferir resolução panorâmica do banner SoundCloud. */
function upgradeSoundCloudVisual(url: string): string {
  return url
    .replace(/-t\d+x\d+\./, '-t2000x500.')
    .replace(/-original\./, '-t2000x500.')
}

/**
 * Limpa visual_url do SoundCloud: https limpo, sem escapes/aspas,
 * e null quando for placeholder/padrão/inválido.
 */
function sanitizeBannerUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null

  let url = raw.trim().replace(/^["']+|["']+$/g, '')

  if (url.includes('\\')) {
    url = unescapeJsonString(url)
  }

  url = url
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .trim()
    .replace(/^["']+|["']+$/g, '')

  if (/^http:\/\//i.test(url)) {
    url = url.replace(/^http:/i, 'https:')
  }

  if (!/^https:\/\//i.test(url)) return null

  // Residuos de escape/aspas → inválido
  if (url.includes('\\') || url.includes('"') || url.includes("'")) {
    return null
  }

  // Placeholders / banners padrão do SoundCloud → null
  if (
    /default_avatar|default_visual|placeholder|transparent|null|undefined/i.test(
      url,
    )
  ) {
    return null
  }

  return upgradeSoundCloudVisual(url)
}

function extractVisualUrl(html: string): string | null {
  const patterns = [
    /"visual_url"\s*:\s*"(https:\\\/\\\/[^"]+|https:\/\/[^"]+)"/i,
    /"visual_url"\s*:\s*"(https?:[^"]+)"/i,
    /visual_url\\?":\\?"(https?:[^"\\]+)/i,
    /"visual_url"\s*:\s*"(https?:(?:\\u002F|\\\/|\/)[^"]+)"/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const cleaned = sanitizeBannerUrl(match[1])
      if (cleaned) return cleaned
    }
  }

  // Meta og:image em páginas de perfil (às vezes é o banner)
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  )
  if (ogMatch?.[1]?.includes('sndcdn.com') && ogMatch[1].includes('visual')) {
    return sanitizeBannerUrl(ogMatch[1])
  }

  return null
}

function extractFirstUserPermalink(html: string): string | null {
  const patterns = [
    /"permalink_url"\s*:\s*"(https:\\\/\\\/soundcloud\.com\\\/[^"\\]+|https:\/\/soundcloud\.com\/[^"]+)"/i,
    /href="(https:\/\/soundcloud\.com\/[a-zA-Z0-9_-]+)"/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const url = match[1].replace(/\\\//g, '/')
      // Ignorar rotas de sistema do SoundCloud
      if (
        !/soundcloud\.com\/(search|discover|upload|pages|settings|you|charts|genres|signin|login)/i.test(
          url,
        )
      ) {
        return url.split('?')[0]
      }
    }
  }

  return null
}

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\')
}

function extractJsonNumber(html: string, field: string): number | null {
  const match = html.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`, 'i'))
  if (!match?.[1]) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function extractJsonString(html: string, field: string): string | null {
  const match = html.match(
    new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'),
  )
  if (!match?.[1]) return null
  const value = unescapeJsonString(match[1]).trim()
  return value.length > 0 ? value : null
}

function formatArtistLocation(
  city: string | null,
  countryCode: string | null,
): string | null {
  const cityLabel = city?.trim() || null
  let countryLabel: string | null = null

  if (countryCode?.trim()) {
    try {
      const regionNames = new Intl.DisplayNames(['pt'], { type: 'region' })
      countryLabel = regionNames.of(countryCode.trim().toUpperCase()) ?? countryCode.trim()
    } catch {
      countryLabel = countryCode.trim()
    }
  }

  if (cityLabel && countryLabel) return `${cityLabel}, ${countryLabel}`
  return cityLabel || countryLabel || null
}

type ArtistMetaPayload = {
  bannerUrl: string | null
  followersCount: number
  trackCount: number
  location: string | null
  description: string | null
  permalinkUrl: string | null
}

const EMPTY_ARTIST_META: ArtistMetaPayload = {
  bannerUrl: null,
  followersCount: 0,
  trackCount: 0,
  location: null,
  description: null,
  permalinkUrl: null,
}

/** Extrai metadados públicos do HTML hidratado do SoundCloud. */
function extractArtistMetaFromHtml(
  html: string,
  permalinkHint: string | null = null,
): ArtistMetaPayload {
  const bannerUrl = extractVisualUrl(html)
  const followersCount = extractJsonNumber(html, 'followers_count') ?? 0
  const trackCount = extractJsonNumber(html, 'track_count') ?? 0
  const city = extractJsonString(html, 'city')
  const countryCode = extractJsonString(html, 'country_code')
  const description = extractJsonString(html, 'description')
  const permalinkUrl =
    extractJsonString(html, 'permalink_url') ||
    permalinkHint ||
    extractFirstUserPermalink(html)

  return {
    bannerUrl,
    followersCount,
    trackCount,
    location: formatArtistLocation(city, countryCode),
    description,
    permalinkUrl:
      permalinkUrl && permalinkUrl.includes('soundcloud.com')
        ? permalinkUrl.split('?')[0]
        : permalinkHint,
  }
}

type SoundCloudApiUser = {
  id?: number
  username?: string
  permalink_url?: string
  avatar_url?: string | null
  followers_count?: number
  track_count?: number
  city?: string | null
  country_code?: string | null
  description?: string | null
  visuals?: {
    visuals?: Array<{ visual_url?: string | null } | null> | null
  } | null
}

type SoundCloudApiTrack = {
  id?: number
  title?: string
  duration?: number
  artwork_url?: string | null
  permalink_url?: string | null
  user?: {
    id?: number
    username?: string
    avatar_url?: string | null
  } | null
}

type ArtistTrackPayload = {
  id: string
  name: string
  artistName: string
  durationMs: number
  artworkUrl: string | null
  permalinkUrl: string | null
}

let cachedClientId: string | null = null
let cachedClientIdAt = 0
const CLIENT_ID_TTL_MS = 1000 * 60 * 60 * 6

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: SC_HEADERS })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/** Obtém client_id público embutido nos assets JS do SoundCloud (com cache). */
async function getSoundCloudClientId(): Promise<string | null> {
  if (cachedClientId && Date.now() - cachedClientIdAt < CLIENT_ID_TTL_MS) {
    return cachedClientId
  }

  try {
    const homeHtml = await fetchHtml('https://soundcloud.com')
    if (!homeHtml) return cachedClientId

    const scriptUrls = [
      ...homeHtml.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g),
    ].map((m) => m[1])

    for (const scriptUrl of scriptUrls.slice(0, 12)) {
      const js = await fetchHtml(scriptUrl)
      if (!js) continue
      const match = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{16,})"/)
      if (match?.[1]) {
        cachedClientId = match[1]
        cachedClientIdAt = Date.now()
        return cachedClientId
      }
    }
  } catch (error) {
    console.error('Erro ao obter client_id SoundCloud:', error)
  }

  return cachedClientId
}

function mapApiUserToMeta(user: SoundCloudApiUser): ArtistMetaPayload {
  const visual =
    user.visuals?.visuals?.find((v) => v?.visual_url)?.visual_url ?? null

  return {
    bannerUrl: sanitizeBannerUrl(visual),
    followersCount: user.followers_count ?? 0,
    trackCount: user.track_count ?? 0,
    location: formatArtistLocation(user.city ?? null, user.country_code ?? null),
    description: user.description?.trim() || null,
    permalinkUrl: user.permalink_url?.split('?')[0] ?? null,
  }
}

/** Preferência pelo utilizador cujo username/permalink mais se aproxima do nome. */
function pickBestUser(
  users: SoundCloudApiUser[],
  name: string,
): SoundCloudApiUser | null {
  if (users.length === 0) return null
  const normalized = name.trim().toLowerCase()
  const exact = users.find(
    (u) =>
      u.username?.toLowerCase() === normalized ||
      u.permalink_url?.split('/').pop()?.toLowerCase() ===
        normalized.replace(/\s+/g, '-'),
  )
  if (exact) return exact
  return [...users].sort(
    (a, b) => (b.followers_count ?? 0) - (a.followers_count ?? 0),
  )[0]
}

function slugifyArtistName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function resolveArtistMetaViaApi(
  name: string,
): Promise<ArtistMetaPayload | null> {
  const clientId = await getSoundCloudClientId()
  if (!clientId) return null

  const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(name.trim())}&client_id=${clientId}&limit=5&app_locale=pt`
  const response = await fetch(url, { headers: SC_HEADERS })
  if (!response.ok) return null

  const data = (await response.json()) as {
    collection?: SoundCloudApiUser[] | null
  }
  const best = pickBestUser(data.collection ?? [], name)
  return best ? mapApiUserToMeta(best) : null
}

async function resolveArtistMetaViaSlug(
  name: string,
): Promise<ArtistMetaPayload | null> {
  const slug = slugifyArtistName(name)
  if (!slug) return null

  const permalink = `https://soundcloud.com/${slug}`
  const profileHtml = await fetchHtml(permalink)
  if (!profileHtml) return null

  const meta = extractArtistMetaFromHtml(profileHtml, permalink)
  if (!meta.followersCount && !meta.trackCount && !meta.bannerUrl) return null
  return meta
}

async function resolveArtistMetaViaSearchHtml(
  name: string,
): Promise<ArtistMetaPayload | null> {
  const query = encodeURIComponent(name.trim())
  const searchHtml = await fetchHtml(
    `https://soundcloud.com/search/people?q=${query}`,
  )
  if (!searchHtml) return null

  const permalink = extractFirstUserPermalink(searchHtml)
  const searchBanner = extractVisualUrl(searchHtml)

  if (!permalink) {
    return searchBanner
      ? { ...EMPTY_ARTIST_META, bannerUrl: searchBanner }
      : null
  }

  const profileHtml = await fetchHtml(permalink)
  if (!profileHtml) {
    return {
      ...EMPTY_ARTIST_META,
      bannerUrl: searchBanner,
      permalinkUrl: permalink,
    }
  }

  const meta = extractArtistMetaFromHtml(profileHtml, permalink)
  return {
    ...meta,
    bannerUrl: meta.bannerUrl || searchBanner,
    permalinkUrl: meta.permalinkUrl || permalink,
  }
}

async function resolveArtistMeta(name: string): Promise<ArtistMetaPayload> {
  try {
    const viaApi = await resolveArtistMetaViaApi(name)
    if (viaApi && (viaApi.followersCount > 0 || viaApi.permalinkUrl)) {
      return viaApi
    }
  } catch (error) {
    console.error('Falha api-v2 SoundCloud:', error)
  }

  try {
    const viaSlug = await resolveArtistMetaViaSlug(name)
    if (viaSlug) return viaSlug
  } catch (error) {
    console.error('Falha slug SoundCloud:', error)
  }

  try {
    const viaHtml = await resolveArtistMetaViaSearchHtml(name)
    if (viaHtml) return viaHtml
  } catch (error) {
    console.error('Falha HTML SoundCloud:', error)
  }

  return { ...EMPTY_ARTIST_META }
}

type StreamQuality = 'low' | 'normal' | 'medium' | 'high' | 'ultra' | 'hifi'

function parseStreamQuality(value: unknown): StreamQuality {
  const raw =
    typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (
    raw === 'low' ||
    raw === 'normal' ||
    raw === 'medium' ||
    raw === 'high' ||
    raw === 'ultra' ||
    raw === 'hifi'
  ) {
    return raw
  }
  return 'high'
}

/** Seleção de bitrate via yt-dlp (abr ≈ kbps). Aceita low/normal/high/ultra/hifi. */
function qualityToYtDlpFormat(quality: StreamQuality): string {
  switch (quality) {
    case 'low':
      return 'bestaudio[abr<=96]/bestaudio[abr<=128]/bestaudio'
    case 'normal':
    case 'medium':
      return 'bestaudio[abr<=160]/bestaudio'
    case 'hifi':
    case 'ultra':
      return 'bestaudio/best'
    case 'high':
    default:
      return 'bestaudio[abr<=256]/bestaudio'
  }
}

/** Remove sufixos comuns de busca (official, lyrics, audio…) para retry. */
function stripStreamQuerySuffixes(query: string): string {
  return query
    .replace(
      /\b(official\s*(audio|video|music\s*video)?|lyrics?|audio|mv|hd|4k|visualizer|topic)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function guessMimeFromUrl(url: string): string {
  if (/mime=audio%2Fwebm|mime=audio\/webm|\.webm/i.test(url)) {
    return 'audio/webm'
  }
  if (/mime=audio%2Fmp4|mime=audio\/mp4|\.m4a|\.mp4/i.test(url)) {
    return 'audio/mp4'
  }
  if (/\.ogg/i.test(url)) return 'audio/ogg'
  return 'audio/webm'
}

function setStreamCorsHeaders(res: express.Response) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Range, Content-Type, Accept, Origin',
  )
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges, Content-Length, Content-Range, Content-Type',
  )
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}

/* -------------------------------------------------------------------------- */
/*  Stream match: multi-candidato + score (título / artista / duração)         */
/* -------------------------------------------------------------------------- */

type StreamCandidate = {
  id: string
  title: string
  url: string
  duration: number
  channel?: string
  source: 'youtube' | 'soundcloud'
}

type ResolvedStream = {
  videoId: string
  title: string
  url: string
  duration: number
  source: 'youtube' | 'soundcloud'
  score: number
}

type StreamResolveInput = {
  query: string
  title?: string
  artist?: string
  expectedDuration?: number
}

const STREAM_RESOLVE_CACHE_TTL_MS = 1000 * 60 * 45
const streamResolveCache = new Map<
  string,
  { at: number; value: ResolvedStream }
>()

const STREAM_CONTEXT_BLOCKLIST = [
  'full album',
  'full mixtape',
  'cypher',
  'slowed',
  'sped up',
  'speed up',
  'nightcore',
  'instrumental',
  'karaoke',
  'remix',
  'mashup',
  'bootleg',
  'cover',
  'live session',
  'live performance',
  'reaction',
  'tracklist',
  'compilation',
] as const

function normalizeStreamText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(
      /\b(official\s*(audio|video|music\s*video|lyric\s*video)?|lyrics?|audio|visuali[sz]er|topic|hd|4k|mv|prod\.?|produced by|prod by|feat\.?|ft\.?|featuring)\b/gi,
      ' ',
    )
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function streamTitleTokens(value: string): string[] {
  return normalizeStreamText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function hasBlockedStreamContext(
  candidateTitle: string,
  expectedTitle: string,
): boolean {
  const candidate = normalizeStreamText(candidateTitle)
  const expected = normalizeStreamText(expectedTitle)
  for (const phrase of STREAM_CONTEXT_BLOCKLIST) {
    if (candidate.includes(phrase) && !expected.includes(phrase)) {
      return true
    }
  }
  return false
}

function titleKeywordsPresent(
  expectedTitle: string,
  candidateTitle: string,
): boolean {
  const expectedTokens = streamTitleTokens(expectedTitle)
  if (expectedTokens.length === 0) return true
  const candidateNorm = normalizeStreamText(candidateTitle)
  const candidateSet = new Set(streamTitleTokens(candidateTitle))
  const significant = expectedTokens.filter(
    (token) => token.length >= 3 || expectedTokens.length <= 2,
  )
  if (significant.length === 0) return true
  const hits = significant.filter(
    (token) => candidateSet.has(token) || candidateNorm.includes(token),
  )
  // Exige a maioria das palavras-chave do título
  return hits.length >= Math.ceil(significant.length * 0.7)
}

/**
 * Pontua candidato YouTube/SoundCloud vs metadados esperados.
 * Retorna -Infinity para rejeição dura.
 */
function scoreStreamCandidate(
  candidate: StreamCandidate,
  expectedTitle: string,
  expectedArtist: string,
  expectedDuration: number,
): number {
  if (!candidate.title?.trim() || !candidate.url) return Number.NEGATIVE_INFINITY

  if (expectedTitle && hasBlockedStreamContext(candidate.title, expectedTitle)) {
    return Number.NEGATIVE_INFINITY
  }

  if (expectedTitle && !titleKeywordsPresent(expectedTitle, candidate.title)) {
    return Number.NEGATIVE_INFINITY
  }

  let score = 0

  if (expectedTitle) {
    score += tokenSimilarity(expectedTitle, candidate.title) * 40
  }

  if (expectedArtist) {
    const inTitle = isArtistMatch(expectedArtist, candidate.title)
    const inChannel = candidate.channel
      ? isArtistMatch(expectedArtist, candidate.channel)
      : false
    if (inTitle || inChannel) {
      score += inTitle && inChannel ? 35 : 25
    } else {
      score -= 20
    }
  }

  if (expectedDuration > 0) {
    const candDur = candidate.duration > 0 ? candidate.duration : 0
    if (candDur <= 0) {
      score -= 8
    } else {
      const diff = Math.abs(candDur - expectedDuration)
      if (diff <= 4) score += 40
      else if (diff <= 8) score += 28
      else if (diff <= 15) score += 12
      else if (diff <= 25) score -= 25
      else return Number.NEGATIVE_INFINITY
    }
  }

  // Prefere YouTube topic / áudio curto vs uploads longos sem duração esperada
  if (expectedDuration <= 0 && candidate.duration > 0) {
    if (candidate.duration > 60 * 12) score -= 30
    else if (candidate.duration <= 60 * 8) score += 4
  }

  if (candidate.source === 'soundcloud') score += 2

  return score
}

function streamCacheKey(input: StreamResolveInput): string {
  const artist = (input.artist ?? '').trim().toLowerCase()
  const title = (input.title ?? input.query).trim().toLowerCase()
  const duration =
    input.expectedDuration && input.expectedDuration > 0
      ? Math.round(input.expectedDuration)
      : 0
  return `v2::${artist}::${title}::${duration}`
}

function parseExpectedDuration(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

function readStreamQueryInput(req: express.Request): StreamResolveInput | null {
  const queryRaw = req.query.query
  const titleRaw = req.query.title
  const artistRaw = req.query.artist

  const title =
    typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : ''
  const artist =
    typeof artistRaw === 'string' && artistRaw.trim() ? artistRaw.trim() : ''
  const query =
    typeof queryRaw === 'string' && queryRaw.trim()
      ? queryRaw.trim()
      : [artist, title].filter(Boolean).join(' - ').trim()

  if (!query) return null

  return {
    query,
    title: title || undefined,
    artist: artist || undefined,
    expectedDuration: parseExpectedDuration(req.query.duration),
  }
}

async function searchYoutubeCandidates(
  searchQuery: string,
): Promise<StreamCandidate[]> {
  try {
    const results = await play.search(searchQuery, {
      limit: 5,
      source: { youtube: 'video' },
    })
    if (!Array.isArray(results)) return []
    return results
      .filter((item) => item?.id)
      .map((item) => ({
        id: String(item.id),
        title: item.title ?? '',
        url: `https://www.youtube.com/watch?v=${item.id}`,
        duration: Number(item.durationInSec) || 0,
        channel: item.channel?.name ?? undefined,
        source: 'youtube' as const,
      }))
  } catch (error) {
    console.warn(`[stream] ytsearch5 falhou para "${searchQuery}":`, error)
    return []
  }
}

async function searchSoundCloudCandidates(
  searchQuery: string,
): Promise<StreamCandidate[]> {
  try {
    const clientId = await getSoundCloudClientId()
    if (!clientId) return []
    const apiUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(searchQuery)}&client_id=${clientId}&limit=5&app_locale=en`
    const res = await fetch(apiUrl, { headers: SC_HEADERS })
    if (!res.ok) return []
    const data = (await res.json()) as {
      collection?: Array<{
        id?: number
        title?: string
        duration?: number
        permalink_url?: string
        user?: { username?: string }
      }> | null
    }
    return (data.collection ?? [])
      .filter((track) => track.permalink_url && track.title)
      .map((track) => ({
        id: `sc-${track.id ?? track.permalink_url}`,
        title: track.title ?? '',
        url: track.permalink_url as string,
        duration:
          typeof track.duration === 'number' && track.duration > 0
            ? Math.round(track.duration / 1000)
            : 0,
        channel: track.user?.username,
        source: 'soundcloud' as const,
      }))
  } catch (error) {
    console.warn(`[stream] SoundCloud search falhou para "${searchQuery}":`, error)
    return []
  }
}

function pickBestStreamCandidate(
  candidates: StreamCandidate[],
  expectedTitle: string,
  expectedArtist: string,
  expectedDuration: number,
): ResolvedStream | null {
  let best: { candidate: StreamCandidate; score: number } | null = null

  for (const candidate of candidates) {
    const score = scoreStreamCandidate(
      candidate,
      expectedTitle,
      expectedArtist,
      expectedDuration,
    )
    if (!Number.isFinite(score) || score === Number.NEGATIVE_INFINITY) continue
    if (!best || score > best.score) {
      best = { candidate, score }
    }
  }

  // Sem duração esperada, aceita o melhor score; com duração, exige score mínimo
  if (!best) return null
  if (expectedDuration > 0 && best.score < 20) return null
  if (expectedDuration <= 0 && best.score < 5) return null

  return {
    videoId: best.candidate.id,
    title: best.candidate.title,
    url: best.candidate.url,
    duration: best.candidate.duration,
    source: best.candidate.source,
    score: best.score,
  }
}

async function resolveStreamResult(
  input: StreamResolveInput,
): Promise<ResolvedStream | null> {
  const cacheKey = streamCacheKey(input)
  const cached = streamResolveCache.get(cacheKey)
  if (cached && Date.now() - cached.at < STREAM_RESOLVE_CACHE_TTL_MS) {
    return cached.value
  }

  const expectedTitle = (input.title ?? input.query).trim()
  const expectedArtist = (input.artist ?? '').trim()
  const expectedDuration =
    input.expectedDuration && input.expectedDuration > 0
      ? input.expectedDuration
      : 0

  const primaryQuery =
    expectedArtist && input.title
      ? `${expectedArtist} - ${input.title}`
      : input.query.trim()

  const stripped = stripStreamQuerySuffixes(primaryQuery)
  const searchVariants = [
    primaryQuery,
    `${primaryQuery} audio`,
    expectedArtist && input.title
      ? `${expectedArtist} ${input.title}`
      : null,
    stripped && stripped.toLowerCase() !== primaryQuery.toLowerCase()
      ? stripped
      : null,
  ].filter((item): item is string => Boolean(item))

  const uniqueQueries = [...new Set(searchVariants)]
  const seenIds = new Set<string>()
  const candidates: StreamCandidate[] = []

  for (const q of uniqueQueries) {
    const [yt, sc] = await Promise.all([
      searchYoutubeCandidates(q),
      searchSoundCloudCandidates(q),
    ])
    for (const candidate of [...yt, ...sc]) {
      if (seenIds.has(candidate.id)) continue
      seenIds.add(candidate.id)
      candidates.push(candidate)
    }
    // Já temos candidatos suficientes para pontuar
    if (candidates.length >= 8) break
  }

  const best = pickBestStreamCandidate(
    candidates,
    expectedTitle,
    expectedArtist,
    expectedDuration,
  )

  if (!best) {
    console.warn(
      `[stream] Nenhum candidato válido para "${primaryQuery}" (duration=${expectedDuration || 'n/a'})`,
    )
    return null
  }

  console.log(
    `[stream] Match score=${best.score.toFixed(1)} source=${best.source} dur=${best.duration}s → "${best.title}"`,
  )

  streamResolveCache.set(cacheKey, { at: Date.now(), value: best })
  return best
}

/** @deprecated nome legado — usa resolveStreamResult com score multi-candidato. */
async function resolveYoutubeResult(query: string) {
  return resolveStreamResult({ query })
}

/** Resolve URL direta de áudio com yt-dlp (play-dl cipher está quebrado no YT atual). */
function resolveDirectAudioUrl(
  videoUrl: string,
  quality: StreamQuality,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m',
      'yt_dlp',
      '-f',
      qualityToYtDlpFormat(quality),
      '-g',
      '--no-playlist',
      '--no-warnings',
      videoUrl,
    ]

    const child = spawn('python', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      const url = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^https?:\/\//i.test(line))

      if (url) {
        resolve(url)
        return
      }

      reject(
        new Error(
          `yt-dlp falhou (code=${code}): ${stderr.trim() || 'sem URL'}`,
        ),
      )
    })
  })
}

async function proxyAudioFromUrl(
  req: express.Request,
  res: express.Response,
  sourceUrl: string,
) {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: '*/*',
  }

  if (typeof req.headers.range === 'string' && req.headers.range) {
    headers.Range = req.headers.range
  }

  const upstream = await fetch(sourceUrl, { headers })

  if (!upstream.ok && upstream.status !== 206) {
    throw new Error(`Upstream HTTP ${upstream.status}`)
  }

  setStreamCorsHeaders(res)
  res.status(upstream.status)

  const contentType =
    upstream.headers.get('content-type') || guessMimeFromUrl(sourceUrl)
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')

  const contentLength = upstream.headers.get('content-length')
  if (contentLength) res.setHeader('Content-Length', contentLength)

  const contentRange = upstream.headers.get('content-range')
  if (contentRange) res.setHeader('Content-Range', contentRange)

  if (req.method === 'HEAD' || !upstream.body) {
    res.end()
    return
  }

  const reader = upstream.body.getReader()
  let cancelled = false

  req.on('close', () => {
    cancelled = true
    void reader.cancel().catch(() => undefined)
  })

  try {
    while (!cancelled) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (!res.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => res.once('drain', resolve))
      }
    }
    res.end()
  } catch (error) {
    console.error('Erro ao proxyar áudio:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Falha ao transmitir áudio' })
    } else {
      res.end()
    }
  }
}

function buildStreamProxyPath(
  input: StreamResolveInput,
  quality: StreamQuality,
): string {
  const params = new URLSearchParams()
  params.set('query', input.query)
  if (input.title) params.set('title', input.title)
  if (input.artist) params.set('artist', input.artist)
  if (input.expectedDuration && input.expectedDuration > 0) {
    params.set('duration', String(Math.round(input.expectedDuration)))
  }
  params.set('quality', quality)
  return `/api/stream?${params.toString()}`
}

/** Resolve metadados JSON (fallback YouTube / embeds). */
app.get('/api/stream/resolve', async (req, res) => {
  try {
    const input = readStreamQueryInput(req)
    if (!input) {
      res.status(400).json({
        error: 'Informe query ou title (+ artist opcional)',
      })
      return
    }

    const quality = parseStreamQuality(req.query.quality)
    const resolved = await resolveStreamResult(input)
    if (!resolved) {
      res.status(404).json({ error: 'Vídeo não encontrado' })
      return
    }

    setStreamCorsHeaders(res)
    res.json({
      videoId: resolved.videoId,
      title: resolved.title,
      duration: resolved.duration,
      source: resolved.source,
      score: resolved.score,
      quality,
      streamUrl: buildStreamProxyPath(input, quality),
    })
  } catch (error) {
    console.error('Erro ao resolver stream:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Falha ao resolver vídeo' })
    }
  }
})

/**
 * Proxy de áudio com CORS liberado para Web Audio API.
 * Aceita query + title/artist/duration para casamento multi-candidato.
 * quality: low | normal | medium | high | ultra | hifi → bitrate via yt-dlp.
 * ?resolve=1 mantém compatibilidade com clientes que esperam JSON { videoId }.
 */
async function handleStreamRequest(
  req: express.Request,
  res: express.Response,
) {
  try {
    const input = readStreamQueryInput(req)
    if (!input) {
      res.status(400).json({
        error: 'Informe query ou title (+ artist opcional)',
      })
      return
    }

    const quality = parseStreamQuality(req.query.quality)
    const wantsJson =
      req.query.resolve === '1' ||
      req.query.format === 'json' ||
      (typeof req.headers.accept === 'string' &&
        req.headers.accept.includes('application/json') &&
        !req.headers.accept.includes('audio/'))

    const resolved = await resolveStreamResult(input)
    if (!resolved) {
      res.status(404).json({ error: 'Vídeo não encontrado' })
      return
    }

    if (wantsJson) {
      setStreamCorsHeaders(res)
      res.json({
        videoId: resolved.videoId,
        title: resolved.title,
        duration: resolved.duration,
        source: resolved.source,
        score: resolved.score,
        quality,
        streamUrl: buildStreamProxyPath(input, quality),
      })
      return
    }

    const directUrl = await resolveDirectAudioUrl(resolved.url, quality)
    await proxyAudioFromUrl(req, res, directUrl)
  } catch (error) {
    console.error('Erro detalhado:', error)
    if (!res.headersSent) {
      setStreamCorsHeaders(res)
      res.status(500).json({ error: 'Falha ao resolver stream de áudio' })
    }
  }
}

app.get('/api/stream', handleStreamRequest)
app.head('/api/stream', handleStreamRequest)

app.options('/api/stream', (_req, res) => {
  setStreamCorsHeaders(res)
  res.status(204).end()
})

app.options('/api/stream/resolve', (_req, res) => {
  setStreamCorsHeaders(res)
  res.status(204).end()
})

async function handleArtistMetaRequest(
  req: express.Request,
  res: express.Response,
) {
  try {
    const name = req.query.name

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(200).json({ ...EMPTY_ARTIST_META })
      return
    }

    const meta = await resolveArtistMeta(name)
    res.status(200).json(meta)
  } catch (error) {
    console.error('Erro ao buscar metadados SoundCloud:', error)
    res.status(200).json({ ...EMPTY_ARTIST_META })
  }
}

/** Rota expandida — banner + seguidores, faixas, localização, bio, permalink. */
app.get('/api/artist-meta', handleArtistMetaRequest)

/** Compatibilidade: mesma resposta rica (clientes antigos usam só bannerUrl). */
app.get('/api/artist-banner', handleArtistMetaRequest)

function upgradeSoundCloudArtwork(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  let cleaned = url.trim()
  if (/^http:\/\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^http:/i, 'https:')
  }
  if (!/^https:\/\//i.test(cleaned)) return null
  if (/default_avatar|placeholder/i.test(cleaned)) return null
  return cleaned
    .replace('-large.', '-t500x500.')
    .replace('-t67x67.', '-t500x500.')
    .replace('-badge.', '-t500x500.')
}

/** Resolve o utilizador SoundCloud (com id) pela mesma cascata do artist-meta. */
async function resolveSoundCloudUser(
  name: string,
): Promise<SoundCloudApiUser | null> {
  const clientId = await getSoundCloudClientId()
  if (clientId) {
    try {
      const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(name.trim())}&client_id=${clientId}&limit=5&app_locale=pt`
      const response = await fetch(url, { headers: SC_HEADERS })
      if (response.ok) {
        const data = (await response.json()) as {
          collection?: SoundCloudApiUser[] | null
        }
        const best = pickBestUser(data.collection ?? [], name)
        if (best?.id) return best
      }
    } catch (error) {
      console.error('Falha ao resolver user SoundCloud via API:', error)
    }
  }

  // Fallback: perfil por slug → extrair id do HTML
  try {
    const slug = slugifyArtistName(name)
    if (!slug) return null
    const permalink = `https://soundcloud.com/${slug}`
    const html = await fetchHtml(permalink)
    if (!html) return null
    const idMatch = html.match(/"id"\s*:\s*(\d{5,})/)
    const username =
      extractJsonString(html, 'username') || name.trim()
    if (!idMatch?.[1]) return null
    return {
      id: Number(idMatch[1]),
      username,
      permalink_url: permalink,
      avatar_url: extractJsonString(html, 'avatar_url'),
      track_count: extractJsonNumber(html, 'track_count') ?? 0,
    }
  } catch (error) {
    console.error('Falha ao resolver user SoundCloud via slug:', error)
    return null
  }
}

async function fetchAllSoundCloudUserTracks(
  userId: number,
  clientId: string,
  artistNameFallback: string,
  avatarFallback: string | null,
): Promise<ArtistTrackPayload[]> {
  const tracks: ArtistTrackPayload[] = []
  const seen = new Set<string>()
  let offset = 0
  const limit = 50
  const maxPages = 8

  for (let page = 0; page < maxPages; page++) {
    const url = `https://api-v2.soundcloud.com/users/${userId}/tracks?client_id=${clientId}&limit=${limit}&offset=${offset}&linked_partitioning=1`
    const response = await fetch(url, { headers: SC_HEADERS })
    if (!response.ok) break

    const data = (await response.json()) as {
      collection?: SoundCloudApiTrack[] | null
      next_href?: string | null
    }

    const batch = data.collection ?? []
    if (batch.length === 0) break

    for (const item of batch) {
      if (!item?.id || !item.title?.trim()) continue
      const id = `sc-${item.id}`
      if (seen.has(id)) continue
      seen.add(id)

      const artwork =
        upgradeSoundCloudArtwork(item.artwork_url) ||
        upgradeSoundCloudArtwork(item.user?.avatar_url) ||
        upgradeSoundCloudArtwork(avatarFallback)

      tracks.push({
        id,
        name: item.title.trim(),
        artistName:
          item.user?.username?.trim() || artistNameFallback || 'Artista',
        durationMs: typeof item.duration === 'number' ? item.duration : 0,
        artworkUrl: artwork,
        permalinkUrl: item.permalink_url?.split('?')[0] ?? null,
      })
    }

    if (batch.length < limit && !data.next_href) break
    offset += limit
  }

  return tracks
}

async function handleArtistTracksRequest(
  req: express.Request,
  res: express.Response,
) {
  try {
    const name = req.query.name

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(200).json({ tracks: [], total: 0 })
      return
    }

    const user = await resolveSoundCloudUser(name.trim())
    if (!user?.id) {
      res.status(200).json({ tracks: [], total: 0 })
      return
    }

    const clientId = await getSoundCloudClientId()
    if (!clientId) {
      res.status(200).json({ tracks: [], total: 0 })
      return
    }

    const tracks = await fetchAllSoundCloudUserTracks(
      user.id,
      clientId,
      user.username || name.trim(),
      user.avatar_url ?? null,
    )

    res.status(200).json({
      tracks,
      total: tracks.length,
    })
  } catch (error) {
    console.error('Erro ao buscar faixas SoundCloud:', error)
    res.status(200).json({ tracks: [], total: 0 })
  }
}

/** Catálogo público de faixas do artista no SoundCloud. */
app.get('/api/artist-tracks', handleArtistTracksRequest)

type SearchApiTrack = {
  id: string
  name: string
  artistName: string
  artists: Array<{ id: string; name: string }>
  albumCoverUrl: string
  albumName?: string
  durationMs: number
}

type SearchApiArtist = {
  id: string
  name: string
  imageUrl: string
}

type SearchApiPayload = {
  tracks: SearchApiTrack[]
  artists: SearchApiArtist[]
  playlists: []
}

async function searchSoundCloudCatalog(
  query: string,
): Promise<SearchApiPayload> {
  const empty: SearchApiPayload = { tracks: [], artists: [], playlists: [] }
  const clientId = await getSoundCloudClientId()
  if (!clientId) return empty

  const q = encodeURIComponent(query.trim())
  const headers = SC_HEADERS

  const [tracksRes, usersRes] = await Promise.all([
    fetch(
      `https://api-v2.soundcloud.com/search/tracks?q=${q}&client_id=${clientId}&limit=12&app_locale=pt`,
      { headers },
    ),
    fetch(
      `https://api-v2.soundcloud.com/search/users?q=${q}&client_id=${clientId}&limit=8&app_locale=pt`,
      { headers },
    ),
  ])

  const tracks: SearchApiTrack[] = []
  const artists: SearchApiArtist[] = []
  const seenTracks = new Set<string>()
  const seenArtists = new Set<string>()

  if (tracksRes.ok) {
    const data = (await tracksRes.json()) as {
      collection?: SoundCloudApiTrack[] | null
    }
    for (const item of data.collection ?? []) {
      if (!item?.id || !item.title?.trim()) continue
      const id = `sc-${item.id}`
      if (seenTracks.has(id)) continue
      seenTracks.add(id)

      const artistName =
        item.user?.username?.trim() || 'Artista desconhecido'
      const artistId = item.user?.id
        ? `sc-user-${item.user.id}`
        : `sc-user-${artistName.toLowerCase()}`
      const artwork =
        upgradeSoundCloudArtwork(item.artwork_url) ||
        upgradeSoundCloudArtwork(item.user?.avatar_url) ||
        ''

      tracks.push({
        id,
        name: item.title.trim(),
        artistName,
        artists: [{ id: artistId, name: artistName }],
        albumCoverUrl: artwork,
        albumName: item.title.trim(),
        durationMs: typeof item.duration === 'number' ? item.duration : 0,
      })

      if (!seenArtists.has(artistId)) {
        seenArtists.add(artistId)
        artists.push({
          id: artistId,
          name: artistName,
          imageUrl:
            upgradeSoundCloudArtwork(item.user?.avatar_url) || artwork || '',
        })
      }
    }
  }

  if (usersRes.ok) {
    const data = (await usersRes.json()) as {
      collection?: SoundCloudApiUser[] | null
    }
    for (const user of data.collection ?? []) {
      if (!user?.id || !user.username?.trim()) continue
      const id = `sc-user-${user.id}`
      if (seenArtists.has(id)) continue
      seenArtists.add(id)
      artists.push({
        id,
        name: user.username.trim(),
        imageUrl: upgradeSoundCloudArtwork(user.avatar_url) || '',
      })
    }
  }

  return {
    tracks: tracks.slice(0, 20),
    artists: artists.slice(0, 12),
    playlists: [],
  }
}

/**
 * Pesquisa multi-fonte (SoundCloud) — fallback quando Spotify está em 429
 * ou não indexa artistas underground.
 */
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q
    if (!q || typeof q !== 'string' || !q.trim()) {
      res.status(200).json({ tracks: [], artists: [], playlists: [] })
      return
    }

    const payload = await searchSoundCloudCatalog(q.trim())
    res.status(200).json(payload)
  } catch (error) {
    console.error('Erro em /api/search:', error)
    res.status(200).json({ tracks: [], artists: [], playlists: [] })
  }
})

/* -------------------------------------------------------------------------- */
/*  Agregador Multi-Fontes de Letras (cascata + cache)                         */
/* -------------------------------------------------------------------------- */

type LyricsAggregateResult = {
  syncedLyrics: string | null
  plainLyrics: string | null
  source: string
  found?: boolean
}

type LyricsCandidate = {
  id: string
  title: string
  artist: string
  duration: number | null
  hasSynced: boolean
  source: 'lrclib' | 'genius'
  url: string | null
}

type LrclibHit = {
  id?: number
  name?: string
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
  instrumental?: boolean
}

const LYRICS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

const LRCLIB_HEADERS = {
  ...LYRICS_HEADERS,
  'Lrclib-Client': 'Azuri Music/1.0 (https://github.com)',
}

const lyricsMemoryCache = new Map<
  string,
  { at: number; payload: LyricsAggregateResult }
>()
const LYRICS_CACHE_TTL_MS = 1000 * 60 * 45
/** v4 — descarta caches com traduções intercaladas / match frouxo. */
const LYRICS_MEMORY_CACHE_VERSION = 'v4'

// Descarta entradas antigas em memória ao recarregar o servidor
lyricsMemoryCache.clear()

function lyricsCacheKey(
  title: string,
  artist: string,
  duration: number | null,
): string {
  return `${LYRICS_MEMORY_CACHE_VERSION}|${artist.toLowerCase()}|${title.toLowerCase()}|${duration ?? 0}`
}

function getCachedLyrics(
  title: string,
  artist: string,
  duration: number | null,
): LyricsAggregateResult | null {
  const key = lyricsCacheKey(title, artist, duration)
  const hit = lyricsMemoryCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > LYRICS_CACHE_TTL_MS) {
    lyricsMemoryCache.delete(key)
    return null
  }
  return hit.payload
}

function setCachedLyrics(
  title: string,
  artist: string,
  duration: number | null,
  payload: LyricsAggregateResult,
) {
  lyricsMemoryCache.set(lyricsCacheKey(title, artist, duration), {
    at: Date.now(),
    payload,
  })
}

/** Só aceita resultados com match rigoroso título+artista, duração próxima e texto limpo. */
function gateLyricsResult(
  result: LyricsAggregateResult | null,
  options: {
    expectedArtist: string
    expectedTitle?: string | null
    candidateArtist?: string | null
    candidateTitle?: string | null
    candidateDuration?: number | null
    targetDuration?: number | null
    requireArtist?: boolean
    requireStrictTitle?: boolean
  },
): LyricsAggregateResult | null {
  if (!result) return null

  const requireArtist = options.requireArtist !== false
  const requireStrictTitle = options.requireStrictTitle !== false

  if (
    options.candidateTitle &&
    isTranslationMetadata(
      options.candidateTitle,
      options.expectedTitle ?? undefined,
    )
  ) {
    return null
  }
  if (
    options.candidateArtist &&
    isTranslationMetadata(
      options.candidateArtist,
      options.expectedTitle ?? undefined,
    )
  ) {
    return null
  }

  if (requireStrictTitle && options.expectedTitle?.trim()) {
    if (!options.candidateTitle?.trim() || !options.candidateArtist?.trim()) {
      return null
    }
    if (
      !isStrictTrackMatch(
        options.expectedTitle,
        options.expectedArtist,
        options.candidateTitle,
        options.candidateArtist,
      )
    ) {
      return null
    }
  } else if (requireArtist && options.expectedArtist.trim()) {
    if (!options.candidateArtist?.trim()) return null
    if (!isArtistMatch(options.expectedArtist, options.candidateArtist)) {
      return null
    }
  }

  if (
    options.candidateDuration != null &&
    options.candidateDuration > 0 &&
    options.targetDuration != null &&
    options.targetDuration > 0 &&
    !durationClose(options.candidateDuration, options.targetDuration, 15)
  ) {
    return null
  }

  const text = (result.syncedLyrics || result.plainLyrics || '').trim()
  if (text && !isValidLyricsText(text)) return null

  return result
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:div|p|span)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/**
 * Remove só o cabeçalho Order: de cyphers + nomes curtos seguintes.
 * Para no primeiro marcador [Verse]/[Intro]/[Chorus]/[Refrão]…
 * ou na primeira linha com 4+ palavras — o resto da música fica intacto.
 */
function stripCypherOrderBlock(text: string): string {
  const lines = text.split(/\r?\n/)
  let start = 0
  while (start < lines.length && !lines[start].trim()) start++
  if (start >= lines.length) return text

  const header = lines[start].trim()
  if (!/^(?:verse\s+)?order\s*:|^ordem\s*:/i.test(header)) return text

  let i = start + 1
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }

    // Qualquer marcador entre colchetes encerra o bloco Order:
    if (line.startsWith('[')) break

    const words = line.split(/\s+/).filter(Boolean)
    // Primeira linha com 4+ palavras = início do verso real
    if (words.length >= 4) break

    // Nomes curtos do cabeçalho de ordem (1–3 palavras)
    if (
      words.length >= 1 &&
      words.length <= 3 &&
      line.length <= 40 &&
      !/[.!?,"]/.test(line)
    ) {
      i++
      continue
    }

    break
  }

  return [...lines.slice(0, start), ...lines.slice(i)]
    .join('\n')
    .replace(/^\n+/, '')
    .trim()
}

function countNonEmptyLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length
}

/** Texto limpo precisa ter ≥3 linhas não vazias para contar como letra válida. */
function hasEnoughLyricLines(result: {
  syncedLyrics?: string | null
  plainLyrics?: string | null
}): boolean {
  const text = (result.syncedLyrics || result.plainLyrics || '').trim()
  return countNonEmptyLines(text) >= 3
}

function parseDurationQuery(value: unknown): number | null {
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  return null
}

/** Camada 1 — LRCLIB /api/get (match exato com duração). */
async function fetchLrclibExact(
  title: string,
  artist: string,
  durationSec: number | null,
): Promise<LyricsAggregateResult | null> {
  if (!title || !artist) return null

  const durationsToTry =
    durationSec && durationSec > 0
      ? [
          durationSec,
          durationSec - 1,
          durationSec + 1,
          durationSec - 2,
          durationSec + 2,
          durationSec - 3,
          durationSec + 3,
          durationSec - 4,
          durationSec + 4,
          durationSec - 5,
          durationSec + 5,
        ].filter((d) => d > 0)
      : [null]

  for (const duration of durationsToTry) {
    try {
      const params = new URLSearchParams({
        track_name: title,
        artist_name: artist,
      })
      if (duration != null) params.set('duration', String(duration))

      const res = await fetch(`https://lrclib.net/api/get?${params}`, {
        headers: LRCLIB_HEADERS,
      })
      if (!res.ok) continue

      const data = (await res.json()) as LrclibHit
      const hitTitle = data.trackName || data.name || title
      const hitArtist = data.artistName || artist
      if (!isStrictTrackMatch(title, artist, hitTitle, hitArtist)) continue

      if (data.syncedLyrics?.trim()) {
        return {
          syncedLyrics: data.syncedLyrics.trim(),
          plainLyrics: data.plainLyrics?.trim() || null,
          source: 'lrclib-synced',
          found: true,
        }
      }
      if (data.plainLyrics?.trim()) {
        return {
          syncedLyrics: null,
          plainLyrics: data.plainLyrics.trim(),
          source: 'lrclib',
          found: true,
        }
      }
      if (data.instrumental) {
        return {
          syncedLyrics: null,
          plainLyrics: '♪ Instrumental ♪',
          source: 'lrclib',
          found: true,
        }
      }
    } catch (error) {
      console.error('LRCLIB get falhou:', error)
    }
  }

  return null
}

function scoreLrclibHit(
  hit: LrclibHit,
  variant: LyricsSearchVariant,
  durationSec: number | null,
): number {
  const hitTitle = hit.trackName || hit.name || ''
  const hitArtist = hit.artistName || ''
  const titleScore = tokenSimilarity(hitTitle, variant.title)
  const artistScore = variant.artist
    ? tokenSimilarity(hitArtist, variant.artist)
    : 0
  const durationBonus = durationClose(hit.duration, durationSec, 15) ? 0.15 : -0.4
  const syncedBonus = hit.syncedLyrics?.trim() ? 0.2 : 0
  return titleScore * 0.45 + artistScore * 0.4 + durationBonus + syncedBonus
}

function lrclibHitToResult(hit: LrclibHit): LyricsAggregateResult | null {
  if (hit.syncedLyrics?.trim()) {
    return {
      syncedLyrics: hit.syncedLyrics.trim(),
      plainLyrics: hit.plainLyrics?.trim() || null,
      source: 'lrclib-synced',
      found: true,
    }
  }
  if (hit.plainLyrics?.trim()) {
    return {
      syncedLyrics: null,
      plainLyrics: hit.plainLyrics.trim(),
      source: 'lrclib',
      found: true,
    }
  }
  if (hit.instrumental) {
    return {
      syncedLyrics: null,
      plainLyrics: '♪ Instrumental ♪',
      source: 'lrclib',
      found: true,
    }
  }
  return null
}

/** Camada 2 — LRCLIB /api/search fuzzy (exige artista compatível). */
async function fetchLrclibFuzzy(
  variants: LyricsSearchVariant[],
  expectedArtist: string,
  durationSec: number | null,
): Promise<LyricsAggregateResult | null> {
  let best: { hit: LrclibHit; score: number } | null = null

  const queries = new Set<string>()
  for (const variant of variants) {
    if (variant.artist && variant.query) queries.add(variant.query)
  }

  for (const q of queries) {
    try {
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`
      const res = await fetch(url, { headers: LRCLIB_HEADERS })
      if (!res.ok) continue

      const results = (await res.json()) as LrclibHit[]
      if (!Array.isArray(results)) continue

      for (const hit of results) {
        const variant =
          variants.find((v) => v.query === q) ??
          variants[0]
        if (!variant?.artist) continue

        const hitTitle = hit.trackName || hit.name || ''
        const hitArtist = hit.artistName || ''
        if (
          !isStrictTrackMatch(
            variant.title,
            expectedArtist || variant.artist,
            hitTitle,
            hitArtist,
          )
        ) {
          continue
        }
        if (!durationClose(hit.duration, durationSec, 15)) continue

        const score = scoreLrclibHit(hit, variant, durationSec)
        if (!best || score > best.score) best = { hit, score }
      }
    } catch (error) {
      console.error('LRCLIB search falhou:', error)
    }
  }

  if (!best || best.score < 0.7) return null

  const expectedTitle =
    variants.find((v) => v.artist)?.title || variants[0]?.title || ''

  return gateLyricsResult(lrclibHitToResult(best.hit), {
    expectedArtist,
    expectedTitle,
    candidateArtist: best.hit.artistName,
    candidateTitle: best.hit.trackName || best.hit.name,
    candidateDuration: best.hit.duration,
    targetDuration: durationSec,
  })
}

async function scrapeGeniusLyrics(songUrl: string): Promise<string | null> {
  const pageHtml = await fetchHtml(songUrl)
  if (!pageHtml) return null

  const containers = [
    ...pageHtml.matchAll(
      /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi,
    ),
  ]
  if (containers.length === 0) return null

  const plain = stripCypherOrderBlock(
    containers
      .map((m) => stripHtmlToText(m[1] ?? ''))
      .filter(Boolean)
      .join('\n\n')
      .trim(),
  )

  if (!plain || countNonEmptyLines(plain) < 3) return null
  if (!isValidLyricsText(plain)) return null
  return plain
}

type GeniusHit = {
  type?: string
  result?: {
    id?: number
    url?: string
    title?: string
    full_title?: string
    primary_artist?: { name?: string }
  }
}

async function searchGeniusHits(q: string): Promise<GeniusHit[]> {
  const searchUrl = `https://genius.com/api/search/multi?per_page=5&q=${encodeURIComponent(q)}`
  const searchRes = await fetch(searchUrl, { headers: LYRICS_HEADERS })
  if (!searchRes.ok) return []

  const searchData = (await searchRes.json()) as {
    response?: {
      sections?: Array<{
        type?: string
        hits?: GeniusHit[]
      }>
    }
  }

  const hits: GeniusHit[] = []
  for (const section of searchData.response?.sections ?? []) {
    for (const hit of section.hits ?? []) {
      if (hit.type === 'song' || section.type === 'song' || section.type === 'top_hit') {
        hits.push(hit)
      }
    }
  }
  return hits
}

/** Camada 3 — Genius search + scrape (anti-tradução + match rigoroso). */
async function fetchFromGenius(
  variants: LyricsSearchVariant[],
  expectedArtist: string,
): Promise<LyricsAggregateResult | null> {
  const triedUrls = new Set<string>()

  for (const variant of variants) {
    if (!variant.artist) continue
    const q = `${variant.artist} ${variant.title}`
    if (!q.trim()) continue

    try {
      const hits = await searchGeniusHits(q)
      for (const hit of hits) {
        const result = hit.result
        const url = result?.url
        if (!url || !/genius\.com\//i.test(url) || triedUrls.has(url)) continue
        if (hit.type && hit.type !== 'song') continue

        const hitTitle = result?.title || result?.full_title || ''
        const hitFullTitle = result?.full_title || hitTitle
        const hitArtist = result?.primary_artist?.name || ''

        // Bloqueia páginas de tradução / adaptação (Genius Japanese Translations etc.)
        if (
          isTranslationMetadata(hitTitle, variant.title) ||
          isTranslationMetadata(hitFullTitle, variant.title) ||
          isTranslationMetadata(hitArtist, variant.title) ||
          isTranslationMetadata(url, variant.title)
        ) {
          continue
        }

        if (
          !isStrictTrackMatch(
            variant.title,
            expectedArtist || variant.artist,
            hitTitle,
            hitArtist,
          )
        ) {
          continue
        }

        triedUrls.add(url)
        const plain = await scrapeGeniusLyrics(url)
        if (!plain) continue

        return gateLyricsResult(
          {
            syncedLyrics: null,
            plainLyrics: plain,
            source: 'genius',
            found: true,
          },
          {
            expectedArtist,
            expectedTitle: variant.title,
            candidateArtist: hitArtist,
            candidateTitle: hitTitle,
          },
        )
      }
    } catch (error) {
      console.error('Genius lyrics falhou:', error)
    }
  }

  return null
}

/** Camada 4 — Lyrics.ovh fallback. */
async function fetchFromLyricsOvh(
  variants: LyricsSearchVariant[],
  expectedArtist: string,
): Promise<LyricsAggregateResult | null> {
  for (const variant of variants) {
    if (!variant.title || !variant.artist) continue
    if (!isArtistMatch(expectedArtist, variant.artist)) continue

    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(variant.artist)}/${encodeURIComponent(variant.title)}`
      const res = await fetch(url, { headers: LYRICS_HEADERS })
      if (!res.ok) continue

      const data = (await res.json()) as { lyrics?: string }
      const lyrics = data.lyrics?.trim()
      if (!lyrics || !isValidLyricsText(lyrics)) continue

      return gateLyricsResult(
        {
          syncedLyrics: null,
          plainLyrics: lyrics.replace(/\r\n/g, '\n').trim(),
          source: 'lyrics.ovh',
          found: true,
        },
        {
          expectedArtist,
          expectedTitle: variant.title,
          candidateArtist: variant.artist,
          candidateTitle: variant.title,
        },
      )
    } catch (error) {
      console.error('Lyrics.ovh falhou:', error)
    }
  }
  return null
}

type SoundCloudTrackHit = {
  title?: string
  description?: string | null
  user?: { username?: string }
  permalink_url?: string
  duration?: number
}

/** Extra — description SoundCloud (só com artista compatível + texto limpo). */
async function fetchFromSoundCloudDescription(
  variants: LyricsSearchVariant[],
  expectedArtist: string,
): Promise<LyricsAggregateResult | null> {
  for (const variant of variants.slice(0, 3)) {
    if (!variant.artist) continue
    const q = variant.query || `${variant.artist} ${variant.title}`
    if (!q) continue

    try {
      const clientId = await getSoundCloudClientId()
      if (clientId) {
        const apiUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=5&app_locale=en`
        const apiRes = await fetch(apiUrl, { headers: SC_HEADERS })
        if (apiRes.ok) {
          const data = (await apiRes.json()) as {
            collection?: SoundCloudTrackHit[] | null
          }
          for (const track of data.collection ?? []) {
            const trackArtist = track.user?.username || ''
            const trackTitle = track.title || ''
            if (
              !isStrictTrackMatch(
                variant.title,
                expectedArtist || variant.artist,
                trackTitle,
                trackArtist,
              )
            ) {
              continue
            }

            const desc = track.description?.trim()
            if (
              desc &&
              countNonEmptyLines(desc) > 4 &&
              isValidLyricsText(desc)
            ) {
              return gateLyricsResult(
                {
                  syncedLyrics: null,
                  plainLyrics: desc.replace(/\r\n/g, '\n').trim(),
                  source: 'soundcloud',
                  found: true,
                },
                {
                  expectedArtist,
                  expectedTitle: variant.title,
                  candidateArtist: trackArtist,
                  candidateTitle: trackTitle,
                },
              )
            }
          }
        }
      }
    } catch (error) {
      console.error('SoundCloud API lyrics falhou:', error)
    }
  }

  return null
}

async function aggregateLyrics(
  title: string,
  artist: string,
  durationSec: number | null,
): Promise<LyricsAggregateResult | null> {
  const cached = getCachedLyrics(title, artist, durationSec)
  if (cached) {
    // Revalida cache antigo em memória (anti-spam / artista)
    const text = (cached.syncedLyrics || cached.plainLyrics || '').trim()
    if (text && isValidLyricsText(text)) return cached
    lyricsMemoryCache.delete(lyricsCacheKey(title, artist, durationSec))
  }

  // Busca automática: nunca só pelo título (evita "All Night" → outro artista)
  const variants = buildSearchVariants(title, artist).filter((v) => v.artist)
  if (variants.length === 0) return null

  const expectedArtist = cleanLyricsArtist(artist) || variants[0].artist
  const primary = variants[0]

  // Camada 1 — LRCLIB exato (já valida isStrictTrackMatch internamente)
  if (primary?.artist) {
    const exact = await fetchLrclibExact(
      primary.title,
      primary.artist,
      durationSec,
    )
    const gatedExact = gateLyricsResult(exact, {
      expectedArtist,
      expectedTitle: primary.title,
      candidateArtist: primary.artist,
      candidateTitle: primary.title,
      targetDuration: durationSec,
      requireArtist: true,
    })
    if (gatedExact) {
      setCachedLyrics(title, artist, durationSec, gatedExact)
      return gatedExact
    }
  }

  // Camada 2 — LRCLIB fuzzy (score ≥0.7 + strict title)
  const fuzzy = await fetchLrclibFuzzy(variants, expectedArtist, durationSec)
  if (fuzzy) {
    setCachedLyrics(title, artist, durationSec, fuzzy)
    return fuzzy
  }

  // Camada 3 — Genius (anti-tradução + strict)
  const genius = await fetchFromGenius(variants, expectedArtist)
  if (genius) {
    setCachedLyrics(title, artist, durationSec, genius)
    return genius
  }

  // Camada 4 — Lyrics.ovh
  const ovh = await fetchFromLyricsOvh(variants, expectedArtist)
  if (ovh) {
    setCachedLyrics(title, artist, durationSec, ovh)
    return ovh
  }

  // Extra underground
  const sc = await fetchFromSoundCloudDescription(variants, expectedArtist)
  if (sc) {
    setCachedLyrics(title, artist, durationSec, sc)
    return sc
  }

  // Nenhum candidato passou na validação rigorosa — não arriscar letra errada
  return { syncedLyrics: null, plainLyrics: null, source: '', found: false }
}

async function collectLyricsCandidates(q: string): Promise<LyricsCandidate[]> {
  const query = q.trim()
  if (!query) return []

  const candidates: LyricsCandidate[] = []
  const seen = new Set<string>()

  const push = (candidate: LyricsCandidate) => {
    const key = `${candidate.source}:${candidate.id || candidate.url || candidate.title}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(candidate)
  }

  try {
    const lrclibRes = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      { headers: LRCLIB_HEADERS },
    )
    if (lrclibRes.ok) {
      const results = (await lrclibRes.json()) as LrclibHit[]
      for (const hit of results.slice(0, 6)) {
        push({
          id: String(hit.id ?? `${hit.artistName}-${hit.trackName}`),
          title: hit.trackName || hit.name || 'Sem título',
          artist: hit.artistName || 'Artista desconhecido',
          duration: typeof hit.duration === 'number' ? hit.duration : null,
          hasSynced: Boolean(hit.syncedLyrics?.trim()),
          source: 'lrclib',
          url: null,
        })
      }
    }
  } catch (error) {
    console.error('LRCLIB candidates falhou:', error)
  }

  try {
    const hits = await searchGeniusHits(query)
    for (const hit of hits.slice(0, 6)) {
      const result = hit.result
      if (!result?.url || hit.type === 'artist') continue
      const candTitle = result.title || result.full_title || 'Sem título'
      const candArtist =
        result.primary_artist?.name || 'Artista desconhecido'
      const fullTitle = result.full_title || candTitle
      if (
        isTranslationMetadata(candTitle) ||
        isTranslationMetadata(fullTitle) ||
        isTranslationMetadata(candArtist) ||
        isTranslationMetadata(result.url)
      ) {
        continue
      }
      push({
        id: String(result.id ?? result.url),
        title: candTitle,
        artist: candArtist,
        duration: null,
        hasSynced: false,
        source: 'genius',
        url: result.url,
      })
    }
  } catch (error) {
    console.error('Genius candidates falhou:', error)
  }

  return candidates.slice(0, 8)
}

async function resolveLyricsCandidate(input: {
  source?: string
  id?: string
  url?: string
  title?: string
  artist?: string
  duration?: number | null
}): Promise<LyricsAggregateResult | null> {
  const source = (input.source || '').toLowerCase()

  if (source === 'lrclib' && input.id) {
    try {
      const res = await fetch(`https://lrclib.net/api/get?id=${encodeURIComponent(input.id)}`, {
        headers: LRCLIB_HEADERS,
      })
      if (res.ok) {
        const data = (await res.json()) as LrclibHit
        if (data.syncedLyrics?.trim()) {
          return {
            syncedLyrics: data.syncedLyrics.trim(),
            plainLyrics: data.plainLyrics?.trim() || null,
            source: 'lrclib-synced',
            found: true,
          }
        }
        if (data.plainLyrics?.trim()) {
          return {
            syncedLyrics: null,
            plainLyrics: data.plainLyrics.trim(),
            source: 'lrclib',
            found: true,
          }
        }
      }
    } catch (error) {
      console.error('Resolve LRCLIB candidate falhou:', error)
    }
  }

  if ((source === 'genius' || input.url) && input.url) {
    try {
      const plain = await scrapeGeniusLyrics(input.url)
      if (plain) {
        return {
          syncedLyrics: null,
          plainLyrics: plain,
          source: 'genius',
          found: true,
        }
      }
    } catch (error) {
      console.error('Resolve Genius candidate falhou:', error)
    }
  }

  if (input.title && input.artist) {
    return aggregateLyrics(
      input.title,
      input.artist,
      input.duration ?? null,
    )
  }

  return null
}

const EMPTY_LYRICS_PAYLOAD = {
  syncedLyrics: null as string | null,
  plainLyrics: null as string | null,
  source: null as string | null,
  found: false as boolean,
}

app.get('/api/lyrics', async (req, res) => {
  try {
    const title = req.query.title
    const artist = req.query.artist

    if (
      !title ||
      typeof title !== 'string' ||
      !title.trim() ||
      !artist ||
      typeof artist !== 'string' ||
      !artist.trim()
    ) {
      res.status(200).json({
        ...EMPTY_LYRICS_PAYLOAD,
        error: 'Parâmetros title e artist são obrigatórios',
      })
      return
    }

    const duration = parseDurationQuery(req.query.duration)
    const result = await aggregateLyrics(title.trim(), artist.trim(), duration)

    if (!result || !hasEnoughLyricLines(result)) {
      res.status(200).json({
        ...EMPTY_LYRICS_PAYLOAD,
        cleanedTitle: cleanLyricsTitle(title),
        cleanedArtist: cleanLyricsArtist(artist),
      })
      return
    }

    res.status(200).json({ ...result, found: true })
  } catch (error) {
    console.error('Erro no agregador de letras:', error)
    res.status(200).json({ ...EMPTY_LYRICS_PAYLOAD })
  }
})

app.get('/api/lyrics/search', async (req, res) => {
  try {
    const q = req.query.q
    if (!q || typeof q !== 'string' || !q.trim()) {
      res.status(200).json({ candidates: [] })
      return
    }

    const candidates = await collectLyricsCandidates(q.trim())
    res.status(200).json({ candidates })
  } catch (error) {
    console.error('Erro em /api/lyrics/search:', error)
    res.status(200).json({ candidates: [] })
  }
})

app.get('/api/lyrics/candidate', async (req, res) => {
  try {
    const source =
      typeof req.query.source === 'string' ? req.query.source : undefined
    const id = typeof req.query.id === 'string' ? req.query.id : undefined
    const url = typeof req.query.url === 'string' ? req.query.url : undefined
    const title =
      typeof req.query.title === 'string' ? req.query.title : undefined
    const artist =
      typeof req.query.artist === 'string' ? req.query.artist : undefined
    const duration = parseDurationQuery(req.query.duration)

    const result = await resolveLyricsCandidate({
      source,
      id,
      url,
      title,
      artist,
      duration,
    })

    if (!result || !hasEnoughLyricLines(result)) {
      res.status(200).json({ ...EMPTY_LYRICS_PAYLOAD })
      return
    }

    res.status(200).json({ ...result, found: true })
  } catch (error) {
    console.error('Erro em /api/lyrics/candidate:', error)
    res.status(200).json({ ...EMPTY_LYRICS_PAYLOAD })
  }
})

/** Alinhamento áudio↔letra via Gemini 2.5 Flash (fallback seguro se sem API key). */
app.post('/api/lyrics/ai-sync', (req, res) => {
  void handleAiLyricsSync(req, res)
})

// Blindagem: falhas de stream/extração não derrubam a porta 3001
process.on('uncaughtException', (error) => {
  console.error('[server] uncaughtException (servidor permanece ativo):', error)
})

process.on('unhandledRejection', (reason) => {
  console.error(
    '[server] unhandledRejection (servidor permanece ativo):',
    reason,
  )
})

app.listen(PORT, () => {
  console.log(`Azuri resolve server em http://localhost:${PORT}`)
  if (isGeminiConfigured()) {
    console.log('✅ Gemini AI Sync configurado e ativo')
  } else {
    console.warn('⚠️ GEMINI_API_KEY não encontrada no server/.env')
  }
})

