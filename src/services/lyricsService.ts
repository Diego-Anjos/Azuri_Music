const LYRICS_API = 'http://localhost:3001/api/lyrics'

export type LyricLine = {
  time: number
  text: string
}

export type LyricsResult = {
  lines: LyricLine[]
  /** Tem timestamps (oficiais, estimados ou manuais). */
  synced: boolean
  /** Timestamps gerados automaticamente a partir de plainLyrics. */
  isEstimated: boolean
  plainText: string | null
  source:
    | 'lrclib'
    | 'lyrics.ovh'
    | 'genius'
    | 'soundcloud'
    | 'custom'
    | 'custom-lrc'
    | string
}

type BackendLyricsPayload = {
  syncedLyrics: string | null
  plainLyrics: string | null
  source: string | null
  error?: string
}

type CachedLyricsPayload = {
  syncedLyrics: string | null
  plainLyrics: string | null
  source: string
  cachedAt: number
}

function customLyricsKey(trackId: string) {
  return `azuri_custom_lyrics_${trackId}`
}

function customLrcKey(trackId: string) {
  return `azuri_custom_lrc_${trackId}`
}

function lyricsCacheKey(trackId: string) {
  return `azuri_lyrics_cache_${trackId}`
}

/** Remove (feat. …), (prod. …), [Official Audio], barras, etc. para melhorar o match. */
export function cleanTrackTitle(title: string): string {
  return title
    .replace(/[\/|｜]/g, ' ')
    .replace(
      /\s*[\(\[]?\s*(feat\.?|ft\.?|featuring|prod\.?|produced by)\s+[^\)\]]*[\)\]]?/gi,
      '',
    )
    .replace(
      /\s*[\(\[][^\)\]]*(official|audio|video|lyric|visuali[sz]er|remaster(?:ed)?|radio edit|explicit|clean)[^\)\]]*[\)\]]/gi,
      '',
    )
    .replace(/\s*[-–—]\s*(official|lyric|audio|video).*$/i, '')
    .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ')
    .replace(/[\(\)\[\]\{\}]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Extrai o artista principal (antes de feat./ft./&/,). */
export function primaryArtistName(artistName: string): string {
  return (
    artistName
      .split(/\s*(?:,|&| feat\.?| ft\.?| featuring)\s+/i)[0]
      ?.trim() || artistName.trim()
  )
}

/** Converte LRC `[mm:ss.xx] texto` em linhas com tempo em segundos. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  const pattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/g

  for (const raw of lrc.split(/\r?\n/)) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    const timestamps: number[] = []
    let text = ''

    while ((match = pattern.exec(raw)) !== null) {
      const mins = Number(match[1])
      const secs = Number(match[2])
      const frac = match[3] ?? '0'
      const fraction =
        frac.length === 1
          ? Number(frac) / 10
          : frac.length === 2
            ? Number(frac) / 100
            : Number(frac) / 1000
      timestamps.push(mins * 60 + secs + fraction)
      text = (match[4] ?? '').trim()
    }

    if (timestamps.length === 0) continue
    if (!text) continue

    for (const time of timestamps) {
      lines.push({ time, text })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

export function linesToLrc(lines: LyricLine[]): string {
  return lines
    .map((line) => {
      const mins = Math.floor(line.time / 60)
      const secs = line.time - mins * 60
      const mm = String(mins).padStart(2, '0')
      const ss = secs.toFixed(2).padStart(5, '0')
      return `[${mm}:${ss}] ${line.text}`
    })
    .join('\n')
}

/**
 * Marcações estruturais a omitir da UI:
 * [Intro], [Chorus], Verse:, Verse 1:, Chorus:, Outro:, etc.
 */
export function isStructuralLyricLine(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  // Linha só com colchetes: [Intro], [Verse 1], [Chorus]…
  if (/^\[[^\]]+\]$/.test(t)) return true
  // Rótulos que terminam com : (Verse:, Chorus:, Hook:, etc.)
  if (
    /^(verse|chorus|intro|outro|bridge|hook|refrain|pre-?chorus|interlude|break|drop|solo|instru(?:mental)?)(\s*\d+)?\s*:$/i.test(
      t,
    )
  ) {
    return true
  }
  // Qualquer linha curta que seja só "Algo:"
  if (/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s\-']{0,24}:$/.test(t)) return true
  return false
}

/** Remove rótulos de estrutura do texto plano antes de sincronizar/exibir. */
export function stripStructuralLabels(plainLyrics: string): string {
  return plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isStructuralLyricLine(line))
    .join('\n')
}

/**
 * Distribui timestamps pela duração da faixa, ponderados pelo comprimento
 * de cada verso cantado. Intro ~12% (trap/underground); outro ~7%.
 * Rótulos estruturais são filtrados e não entram na lista.
 */
export function generateSmartSync(
  plainLyrics: string,
  durationSec: number,
): { lines: LyricLine[]; isEstimated: true } {
  const texts = stripStructuralLabels(plainLyrics)
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)

  if (texts.length === 0) {
    return { lines: [], isEstimated: true }
  }

  const safeDuration = Math.max(
    durationSec > 0 ? durationSec : texts.length * 3.5,
    30,
  )
  const start = safeDuration * 0.12
  const end = safeDuration * 0.93
  const available = Math.max(end - start, 1)

  const weights = texts.map((text) => Math.max(text.length, 1))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  let cursor = start
  const lines: LyricLine[] = texts.map((text, index) => {
    const line: LyricLine = { time: Number(cursor.toFixed(3)), text }
    cursor += (weights[index] / totalWeight) * available
    return line
  })

  return { lines, isEstimated: true }
}

function withSmartSync(
  plain: string,
  durationSec: number | undefined,
  source: LyricsResult['source'],
): LyricsResult {
  const cleaned = stripStructuralLabels(plain)
  const estimated = generateSmartSync(cleaned, durationSec ?? 0)
  return {
    lines: estimated.lines,
    synced: estimated.lines.length > 0,
    isEstimated: true,
    plainText: cleaned,
    source,
  }
}

function syncedFromLrc(
  lrc: string,
  plainText: string | null,
  source: LyricsResult['source'],
): LyricsResult | null {
  const lines = parseLrc(lrc).filter((line) => !isStructuralLyricLine(line.text))
  if (lines.length === 0) return null
  return {
    lines,
    synced: true,
    isEstimated: false,
    plainText: plainText ? stripStructuralLabels(plainText) : plainText,
    source,
  }
}

function payloadToResult(
  payload: { syncedLyrics: string | null; plainLyrics: string | null; source: string },
  durationSec: number | undefined,
): LyricsResult | null {
  const synced = payload.syncedLyrics?.trim()
  if (synced) {
    const official = syncedFromLrc(
      synced,
      payload.plainLyrics?.trim() || synced,
      payload.source || 'lrclib',
    )
    if (official) return official
  }

  const plain = payload.plainLyrics?.trim()
  if (!plain) return null

  // Sincronização inteligente obrigatória para plain (Genius, ovh, SC, lrclib)
  return withSmartSync(plain, durationSec, payload.source || 'backend')
}

function readLyricsCache(trackId: string): CachedLyricsPayload | null {
  try {
    const raw = localStorage.getItem(lyricsCacheKey(trackId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedLyricsPayload
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.syncedLyrics && !parsed.plainLyrics) return null
    return parsed
  } catch {
    return null
  }
}

function writeLyricsCache(
  trackId: string,
  payload: {
    syncedLyrics: string | null
    plainLyrics: string | null
    source: string
  },
) {
  try {
    const entry: CachedLyricsPayload = {
      syncedLyrics: payload.syncedLyrics,
      plainLyrics: payload.plainLyrics,
      source: payload.source,
      cachedAt: Date.now(),
    }
    localStorage.setItem(lyricsCacheKey(trackId), JSON.stringify(entry))
  } catch {
    /* ignore quota */
  }
}

export function getCustomLrc(trackId: string): LyricsResult | null {
  try {
    const raw = localStorage.getItem(customLrcKey(trackId))
    if (!raw?.trim()) return null
    return syncedFromLrc(raw, raw, 'custom-lrc')
  } catch {
    return null
  }
}

export function saveCustomLrc(
  trackId: string,
  lines: LyricLine[],
): LyricsResult | null {
  if (lines.length === 0) return null
  const lrc = linesToLrc(lines)
  try {
    localStorage.setItem(customLrcKey(trackId), lrc)
  } catch {
    /* ignore quota */
  }
  return {
    lines: [...lines].sort((a, b) => a.time - b.time),
    synced: true,
    isEstimated: false,
    plainText: lrc,
    source: 'custom-lrc',
  }
}

export function getCustomLyrics(
  trackId: string,
  durationSec?: number,
): LyricsResult | null {
  try {
    const raw = localStorage.getItem(customLyricsKey(trackId))
    if (!raw?.trim()) return null

    if (/\[\d{1,2}:\d{2}/.test(raw)) {
      const synced = syncedFromLrc(raw, raw, 'custom')
      if (synced) return synced
    }

    return withSmartSync(raw.trim(), durationSec, 'custom')
  } catch {
    return null
  }
}

export function saveCustomLyrics(
  trackId: string,
  lyrics: string,
  durationSec?: number,
): LyricsResult | null {
  const trimmed = lyrics.trim()
  if (!trimmed) {
    try {
      localStorage.removeItem(customLyricsKey(trackId))
    } catch {
      /* ignore */
    }
    return null
  }

  try {
    localStorage.setItem(customLyricsKey(trackId), trimmed)
  } catch {
    /* ignore quota */
  }

  if (/\[\d{1,2}:\d{2}/.test(trimmed)) {
    const synced = syncedFromLrc(trimmed, trimmed, 'custom')
    if (synced) return synced
  }

  return withSmartSync(trimmed, durationSec, 'custom')
}

export async function fetchLyrics(input: {
  trackId: string
  trackName: string
  artistName: string
  albumName?: string
  durationMs?: number
}): Promise<LyricsResult | null> {
  const durationSec =
    input.durationMs != null && input.durationMs > 0
      ? input.durationMs / 1000
      : undefined

  const customLrc = getCustomLrc(input.trackId)
  if (customLrc) return customLrc

  const custom = getCustomLyrics(input.trackId, durationSec)
  if (custom) return custom

  // Cache local — abertura instantânea sem nova rede
  const cached = readLyricsCache(input.trackId)
  if (cached) {
    const fromCache = payloadToResult(cached, durationSec)
    if (fromCache) return fromCache
  }

  const cleanTitle = cleanTrackTitle(input.trackName) || input.trackName.trim()
  const primaryArtist = primaryArtistName(input.artistName)
  if (!cleanTitle || !primaryArtist) return null

  try {
    const params = new URLSearchParams({
      title: cleanTitle,
      artist: primaryArtist,
    })
    if (durationSec != null && durationSec > 0) {
      params.set('duration', String(Math.round(durationSec)))
    }

    const res = await fetch(`${LYRICS_API}?${params.toString()}`)
    if (!res.ok) {
      // Backend deve devolver 200; qualquer falha de rede/proxy → null silencioso
      return null
    }

    const data = (await res.json()) as BackendLyricsPayload

    // Sem letra encontrada (200 + nulls) → LyricsView mostra colar manualmente
    if (!data.syncedLyrics?.trim() && !data.plainLyrics?.trim()) {
      return null
    }

    const source = data.source || 'backend'
    writeLyricsCache(input.trackId, {
      syncedLyrics: data.syncedLyrics,
      plainLyrics: data.plainLyrics,
      source,
    })

    return payloadToResult(
      {
        syncedLyrics: data.syncedLyrics,
        plainLyrics: data.plainLyrics,
        source,
      },
      durationSec,
    )
  } catch {
    // Sem log no console — falha de rede/parse trata-se como letra indisponível
    return null
  }
}

/** Reaplica smart sync quando a duração real do player fica disponível. */
export function refreshEstimatedSync(
  result: LyricsResult,
  durationSec: number,
): LyricsResult {
  if (!result.isEstimated || !result.plainText || durationSec <= 0) {
    return result
  }
  const estimated = generateSmartSync(result.plainText, durationSec)
  return {
    ...result,
    lines: estimated.lines,
    synced: estimated.lines.length > 0,
    isEstimated: true,
  }
}

export function buildExternalLyricsSearchUrl(
  trackName: string,
  artistName: string,
): string {
  const q = `${cleanTrackTitle(trackName)} ${artistName} lyrics`.trim()
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
