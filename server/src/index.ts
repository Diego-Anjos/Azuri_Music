import cors from 'cors'
import express from 'express'
import play from 'play-dl'

const app = express()
const PORT = Number(process.env.PORT) || 3001

app.use(cors())

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
  username?: string
  permalink_url?: string
  followers_count?: number
  track_count?: number
  city?: string | null
  country_code?: string | null
  description?: string | null
  visuals?: {
    visuals?: Array<{ visual_url?: string | null } | null> | null
  } | null
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

app.get('/api/stream', async (req, res) => {
  try {
    const query = req.query.query

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Parâmetro query é obrigatório' })
      return
    }

    const results = await play.search(query.trim(), {
      limit: 1,
      source: { youtube: 'video' },
    })

    const firstResult = Array.isArray(results) ? results[0] : undefined

    if (!firstResult?.id) {
      res.status(404).json({ error: 'Vídeo não encontrado' })
      return
    }

    res.json({
      videoId: firstResult.id,
      title: firstResult.title,
    })
  } catch (error) {
    console.error('Erro detalhado:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Falha ao resolver vídeo' })
    }
  }
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

/* -------------------------------------------------------------------------- */
/*  Agregador Multi-Fontes de Letras                                           */
/* -------------------------------------------------------------------------- */

type LyricsAggregateResult = {
  syncedLyrics: string | null
  plainLyrics: string | null
  source: string
}

const LYRICS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

function cleanLyricsTitle(title: string): string {
  return title
    // Barras / e | → espaços (ex: Answers/Make Sense → Answers Make Sense)
    .replace(/[\/|｜]/g, ' ')
    .replace(
      /\s*[([{]?\s*(feat\.?|ft\.?|featuring|prod\.?|produced by)\s+[^)\]}]*[)\]}]?/gi,
      '',
    )
    .replace(
      /\s*[([{][^)\]}]*(official|audio|video|lyric|visuali[sz]er|remaster(?:ed)?|radio edit|explicit|clean)[^)\]}]*[)\]}]/gi,
      '',
    )
    .replace(/\s*[-–—]\s*(official|lyric|audio|video).*$/i, '')
    // Remove parênteses/colchetes restantes (conteúdo incluído)
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/[([{}\])]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Variantes de título para cascata (completo limpo + 1ª parte antes de / ou |). */
function buildLyricsTitleVariants(rawTitle: string): string[] {
  const variants: string[] = []
  const seen = new Set<string>()

  const push = (value: string) => {
    const cleaned = cleanLyricsTitle(value)
    if (!cleaned) return
    const key = cleaned.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    variants.push(cleaned)
  }

  push(rawTitle)

  // Se o original tinha barra/pipe, tentar só a primeira parte
  const firstSegment = rawTitle.split(/[\/|｜]/)[0]?.trim()
  if (firstSegment && firstSegment.toLowerCase() !== rawTitle.trim().toLowerCase()) {
    push(firstSegment)
  }

  return variants
}

function primaryLyricsArtist(artistName: string): string {
  return (
    artistName
      .split(/\s*(?:,|&| feat\.?| ft\.?| featuring)\s+/i)[0]
      ?.trim() || artistName.trim()
  )
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

function countNonEmptyLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length
}

/** Fonte 1 — LRCLIB /api/search (nunca /api/get). */
async function fetchFromLrclib(
  cleanTitle: string,
  primaryArtist: string,
): Promise<LyricsAggregateResult | null> {
  try {
    const q = `${cleanTitle} ${primaryArtist}`
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: {
        ...LYRICS_HEADERS,
        'Lrclib-Client': 'Azuri Music/1.0 (https://github.com)',
      },
    })
    if (!res.ok) return null

    const results = (await res.json()) as Array<{
      syncedLyrics?: string | null
      plainLyrics?: string | null
      instrumental?: boolean
    }>

    if (!Array.isArray(results) || results.length === 0) return null

    const withSynced = results.find((r) => r.syncedLyrics?.trim())
    if (withSynced?.syncedLyrics?.trim()) {
      return {
        syncedLyrics: withSynced.syncedLyrics.trim(),
        plainLyrics: withSynced.plainLyrics?.trim() || null,
        source: 'lrclib',
      }
    }

    const withPlain = results.find((r) => r.plainLyrics?.trim())
    if (withPlain?.plainLyrics?.trim()) {
      return {
        syncedLyrics: null,
        plainLyrics: withPlain.plainLyrics.trim(),
        source: 'lrclib',
      }
    }

    if (results.some((r) => r.instrumental)) {
      return {
        syncedLyrics: null,
        plainLyrics: '♪ Instrumental ♪',
        source: 'lrclib',
      }
    }

    return null
  } catch (error) {
    console.error('LRCLIB search falhou:', error)
    return null
  }
}

/** Fonte 2 — Lyrics.ovh */
async function fetchFromLyricsOvh(
  cleanTitle: string,
  primaryArtist: string,
): Promise<LyricsAggregateResult | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`
    const res = await fetch(url, { headers: LYRICS_HEADERS })
    if (!res.ok) return null

    const data = (await res.json()) as { lyrics?: string }
    const lyrics = data.lyrics?.trim()
    if (!lyrics) return null

    return {
      syncedLyrics: null,
      plainLyrics: lyrics.replace(/\r\n/g, '\n').trim(),
      source: 'lyrics.ovh',
    }
  } catch (error) {
    console.error('Lyrics.ovh falhou:', error)
    return null
  }
}

/** Fonte 3 — Genius search + scrape limpo dos containers de letra. */
async function fetchFromGenius(
  cleanTitle: string,
  primaryArtist: string,
): Promise<LyricsAggregateResult | null> {
  try {
    const q = `${cleanTitle} ${primaryArtist}`
    const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`
    const searchRes = await fetch(searchUrl, { headers: LYRICS_HEADERS })
    if (!searchRes.ok) return null

    const searchData = (await searchRes.json()) as {
      response?: {
        sections?: Array<{
          type?: string
          hits?: Array<{
            type?: string
            result?: { url?: string; title?: string }
          }>
        }>
      }
    }

    const sections = searchData.response?.sections ?? []
    let songUrl: string | null = null

    for (const section of sections) {
      if (section.type !== 'song' && section.type !== 'top_hit') continue
      for (const hit of section.hits ?? []) {
        const url = hit.result?.url
        if (url && /genius\.com\//i.test(url)) {
          songUrl = url
          break
        }
      }
      if (songUrl) break
    }

    // Fallback: qualquer hit com URL de música
    if (!songUrl) {
      for (const section of sections) {
        for (const hit of section.hits ?? []) {
          const url = hit.result?.url
          if (url && /genius\.com\//i.test(url) && hit.type === 'song') {
            songUrl = url
            break
          }
        }
        if (songUrl) break
      }
    }

    if (!songUrl) return null

    const pageHtml = await fetchHtml(songUrl)
    if (!pageHtml) return null

    const containers = [
      ...pageHtml.matchAll(
        /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi,
      ),
    ]

    if (containers.length === 0) return null

    const plain = containers
      .map((m) => stripHtmlToText(m[1] ?? ''))
      .filter(Boolean)
      .join('\n\n')
      .trim()

    if (!plain || countNonEmptyLines(plain) < 2) return null

    return {
      syncedLyrics: null,
      plainLyrics: plain,
      source: 'genius',
    }
  } catch (error) {
    console.error('Genius lyrics falhou:', error)
    return null
  }
}

type SoundCloudTrackHit = {
  title?: string
  description?: string | null
  user?: { username?: string }
  permalink_url?: string
}

/** Fonte 4 — Description da faixa no SoundCloud (underground). */
async function fetchFromSoundCloudDescription(
  cleanTitle: string,
  primaryArtist: string,
): Promise<LyricsAggregateResult | null> {
  const q = `${cleanTitle} ${primaryArtist}`

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
          const desc = track.description?.trim()
          if (desc && countNonEmptyLines(desc) > 4) {
            return {
              syncedLyrics: null,
              plainLyrics: desc.replace(/\r\n/g, '\n').trim(),
              source: 'soundcloud',
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('SoundCloud API lyrics falhou:', error)
  }

  // Fallback: HTML da página de pesquisa de sons
  try {
    const searchHtml = await fetchHtml(
      `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`,
    )
    if (!searchHtml) return null

    const descriptions = [
      ...searchHtml.matchAll(
        /"description"\s*:\s*"((?:\\.|[^"\\])*)"/gi,
      ),
    ]

    for (const match of descriptions) {
      const desc = unescapeJsonString(match[1] ?? '').trim()
      if (desc && countNonEmptyLines(desc) > 4) {
        return {
          syncedLyrics: null,
          plainLyrics: desc.replace(/\r\n/g, '\n').trim(),
          source: 'soundcloud',
        }
      }
    }
  } catch (error) {
    console.error('SoundCloud HTML lyrics falhou:', error)
  }

  return null
}

async function tryAllLyricsSources(
  cleanTitle: string,
  primaryArtist: string,
): Promise<LyricsAggregateResult | null> {
  const sources: Array<() => Promise<LyricsAggregateResult | null>> = [
    () => fetchFromLrclib(cleanTitle, primaryArtist),
    () => fetchFromLyricsOvh(cleanTitle, primaryArtist),
    () => fetchFromGenius(cleanTitle, primaryArtist),
    () => fetchFromSoundCloudDescription(cleanTitle, primaryArtist),
  ]

  for (const run of sources) {
    const result = await run()
    if (result?.syncedLyrics || result?.plainLyrics) {
      return result
    }
  }

  return null
}

async function aggregateLyrics(
  title: string,
  artist: string,
): Promise<LyricsAggregateResult | null> {
  const primaryArtist = primaryLyricsArtist(artist)
  const titleVariants = buildLyricsTitleVariants(title)
  if (titleVariants.length === 0 || !primaryArtist) return null

  for (const cleanTitle of titleVariants) {
    const result = await tryAllLyricsSources(cleanTitle, primaryArtist)
    if (result) return result
  }

  return null
}

const EMPTY_LYRICS_PAYLOAD = {
  syncedLyrics: null as string | null,
  plainLyrics: null as string | null,
  source: null as string | null,
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
      // 200 para não poluir o console do browser com 4xx
      res.status(200).json({
        ...EMPTY_LYRICS_PAYLOAD,
        error: 'Parâmetros title e artist são obrigatórios',
      })
      return
    }

    // duration é aceite para compatibilidade com o cliente (usado no smart sync frontend)
    const result = await aggregateLyrics(title.trim(), artist.trim())

    if (!result) {
      res.status(200).json({ ...EMPTY_LYRICS_PAYLOAD })
      return
    }

    res.status(200).json(result)
  } catch (error) {
    console.error('Erro no agregador de letras:', error)
    // Mantém 200 + nulls para o frontend tratar silenciosamente
    res.status(200).json({ ...EMPTY_LYRICS_PAYLOAD })
  }
})

app.listen(PORT, () => {
  console.log(`Azuri resolve server em http://localhost:${PORT}`)
})
