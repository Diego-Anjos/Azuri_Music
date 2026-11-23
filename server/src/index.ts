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

function extractVisualUrl(html: string): string | null {
  const patterns = [
    /"visual_url"\s*:\s*"(https:\\\/\\\/[^"]+|https:\/\/[^"]+)"/i,
    /"visual_url"\s*:\s*"(https?:[^"]+)"/i,
    /visual_url\\?":\\?"(https?:[^"\\]+)/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const raw = match[1]
        .replace(/\\\//g, '/')
        .replace(/\\u002F/gi, '/')
        .replace(/\\u0026/gi, '&')
      if (raw.startsWith('http') && !raw.includes('default_avatar')) {
        return upgradeSoundCloudVisual(raw)
      }
    }
  }

  // Meta og:image em páginas de perfil (às vezes é o banner)
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  )
  if (ogMatch?.[1]?.includes('sndcdn.com') && ogMatch[1].includes('visual')) {
    return upgradeSoundCloudVisual(ogMatch[1])
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
    bannerUrl: visual ? upgradeSoundCloudVisual(visual) : null,
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

app.listen(PORT, () => {
  console.log(`Azuri resolve server em http://localhost:${PORT}`)
})
