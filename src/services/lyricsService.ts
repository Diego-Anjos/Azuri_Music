const LYRICS_API = 'http://localhost:3001/api/lyrics'
const LYRICS_SEARCH_API = 'http://localhost:3001/api/lyrics/search'
const LYRICS_CANDIDATE_API = 'http://localhost:3001/api/lyrics/candidate'
const LYRICS_AI_SYNC_API = 'http://localhost:3001/api/lyrics/ai-sync'

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
  /** Alinhamento feito pelo Gemini a partir do áudio real. */
  isAiSynced?: boolean
  plainText: string | null
  source:
    | 'lrclib'
    | 'lrclib-synced'
    | 'lyrics.ovh'
    | 'genius'
    | 'soundcloud'
    | 'custom'
    | 'custom-lrc'
    | 'gemini'
    | 'gemini-cached'
    | string
}

export type LyricsSearchCandidate = {
  id: string
  title: string
  artist: string
  duration: number | null
  hasSynced: boolean
  source: 'lrclib' | 'genius' | string
  url: string | null
}

type BackendLyricsPayload = {
  syncedLyrics: string | null
  plainLyrics: string | null
  source: string | null
  found?: boolean
  cleanedTitle?: string
  cleanedArtist?: string
  error?: string
}

type CachedLyricsPayload = {
  syncedLyrics: string | null
  plainLyrics: string | null
  source: string
  cachedAt: number
  isAiSynced?: boolean
}

function customLyricsKey(trackId: string) {
  return `azuri_custom_lyrics_${trackId}`
}

function customLrcKey(trackId: string) {
  return `azuri_custom_lrc_${trackId}`
}

function lyricsCacheKey(trackId: string) {
  return `azuri_lyrics_v4_${trackId}`
}

/** Remove caches legados (traduções intercaladas / match frouxo v1–v3). */
function clearLegacyLyricsCache(trackId: string) {
  try {
    localStorage.removeItem(`azuri_lyrics_cache_${trackId}`)
    localStorage.removeItem(`azuri_lyrics_v2_${trackId}`)
    localStorage.removeItem(`azuri_lyrics_v3_${trackId}`)
    localStorage.removeItem(`azuri_lyrics_${trackId}`)
  } catch {
    /* ignore */
  }
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

/** Extrai o artista principal (antes de feat./ft./&/,/x) e remove hashtags. */
export function primaryArtistName(artistName: string): string {
  const withoutTags = artistName.replace(/#\w+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return (
    withoutTags
      .split(/\s*(?:,|&| feat\.?| ft\.?| featuring|\sx\s|\sX\s)\s+/i)[0]
      ?.trim() || withoutTags
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
 * Marcações estruturais / tags de cantor a omitir:
 * (Monika), (Rappii), [Intro], [Verse 1], [Chorus], (x2),
 * Order:, Contributors:, Verse:, etc.
 */
export function isStructuralLyricLine(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  // Só parênteses ou colchetes: (Monika), [Chorus], [Verse 1: Remilia], (x2)…
  if (/^[\[\(].*[\]\)]$/.test(t)) return true
  // Cabeçalhos de cypher / créditos / rótulos de seção
  if (
    /^(?:verse\s+)?order\s*:|^ordem\s*:|^contributors?\s*:/i.test(t) ||
    t.endsWith(':')
  ) {
    return true
  }
  return false
}

/**
 * Remove só o cabeçalho Order: + nomes curtos seguintes.
 * Para no primeiro marcador [Verse]/[Intro]/[Chorus]/[Refrão]…
 * ou na primeira linha com 4+ palavras — o resto da música fica intacto.
 */
export function stripCypherOrderBlock(text: string): string {
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

    if (line.startsWith('[')) break

    const words = line.split(/\s+/).filter(Boolean)
    if (words.length >= 4) break

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

/**
 * Remove rótulos de estrutura, preservando linhas em branco entre estrofes
 * para o smart sync detectar pausas (stanzaBreak).
 */
export function stripStructuralLabels(plainLyrics: string): string {
  const kept: string[] = []

  for (const raw of plainLyrics.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      kept.push('')
      continue
    }
    if (isStructuralLyricLine(line)) continue
    kept.push(line)
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

const MIN_LINE_DURATION = 1.5
const MAX_LINE_DURATION = 6.0
const TAG_MIN_DURATION = 1.1
const TAG_MAX_DURATION = 1.6
const SYLLABLE_WEIGHT = 0.45
const PUNCT_WEIGHT = 0.4
const BASE_LINE_WEIGHT = 0.9
const STANZA_PAUSE_WEIGHT = 1.8

export type VocalWindow = {
  vocalStartSec: number
  vocalEndSec: number
  gaps: Array<{ start: number; end: number }>
}

type SmartSyncEntry = {
  text: string
  stanzaBreakBefore: boolean
  kind: 'verse' | 'tag'
}

/** Tags @prod, [Intro], (prod…) ou até 2 palavras curtas. */
export function isShortTagOrAdlibLine(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/^@[\w.-]+/i.test(t)) return true
  if (/^[\[\(].*[\]\)]$/.test(t)) return true
  if (t.endsWith(':') && t.split(/\s+/).length <= 3) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (
    words.length > 0 &&
    words.length <= 2 &&
    words.every((w) => w.replace(/[^\p{L}\p{N}@]/gu, '').length <= 10) &&
    t.length <= 22
  ) {
    return true
  }
  return false
}

function shortTagDuration(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash + text.charCodeAt(i) * (i + 1)) % 100
  }
  return TAG_MIN_DURATION + (hash / 100) * (TAG_MAX_DURATION - TAG_MIN_DURATION)
}

function parseSungLinesWithStanzas(plainLyrics: string): SmartSyncEntry[] {
  const entries: SmartSyncEntry[] = []
  let pendingBreak = false
  let seenContent = false

  for (const raw of plainLyrics.split(/\r?\n/)) {
    const text = raw.trim()
    if (!text) {
      if (seenContent) pendingBreak = true
      continue
    }

    const kind: 'verse' | 'tag' = isShortTagOrAdlibLine(text) ? 'tag' : 'verse'

    entries.push({
      text,
      kind,
      stanzaBreakBefore: pendingBreak && entries.length > 0,
    })
    pendingBreak = false
    seenContent = true
  }

  return entries
}

function normalizeLyricKey(text: string): string {
  return text.toLowerCase().trim()
}

/** Peso rítmico por sílabas (grupos de vogais) + pontuação + base. */
function computeLineRhythmWeight(line: string): number {
  const syllables = line.match(/[aeiouyáéíóúâêôãõ]+/gi)?.length || 1
  const punctuation = line.match(/[,;—-]/g)?.length || 0
  return syllables * SYLLABLE_WEIGHT + punctuation * PUNCT_WEIGHT + BASE_LINE_WEIGHT
}

/**
 * Refrões/hooks: linhas repetidas (≥2) recebem o mesmo peso médio,
 * mantendo o compasso igual a cada volta.
 */
function equalizeChorusWeights(entries: SmartSyncEntry[]): number[] {
  const rawWeights = entries.map((entry) =>
    entry.kind === 'tag' ? 0 : computeLineRhythmWeight(entry.text),
  )
  const groups = new Map<string, number[]>()

  entries.forEach((entry, index) => {
    if (entry.kind === 'tag') return
    const key = normalizeLyricKey(entry.text)
    const list = groups.get(key)
    if (list) list.push(index)
    else groups.set(key, [index])
  })

  const weights = [...rawWeights]
  for (const indices of groups.values()) {
    if (indices.length < 2) continue
    const avg =
      indices.reduce((sum, i) => sum + rawWeights[i], 0) / indices.length
    for (const i of indices) weights[i] = avg
  }

  return weights
}

function resolveIntroOutroBounds(
  verseCount: number,
  safeDuration: number,
): { start: number; end: number } {
  if (verseCount <= 12 && safeDuration > 120) {
    return {
      start: safeDuration * 0.18,
      end: safeDuration * 0.88,
    }
  }

  if (verseCount > 30 && safeDuration < 120) {
    return {
      start: Math.max(4, safeDuration * 0.06),
      end: safeDuration * 0.96,
    }
  }

  return {
    start: Math.min(24, Math.max(8, safeDuration * 0.14)),
    end: safeDuration * 0.92,
  }
}

/** Redistribui durações para somar `targetSum`, respeitando [min, max]. */
function redistributeClamped(
  values: number[],
  targetSum: number,
  min: number,
  max: number,
): number[] {
  const n = values.length
  if (n === 0) return []

  const feasible = Math.min(n * max, Math.max(n * min, targetSum))
  const sum0 = values.reduce((a, b) => a + b, 0) || 1
  let result = values.map((v) => (v / sum0) * feasible)

  for (let iter = 0; iter < 24; iter++) {
    const free: number[] = []
    let lockedSum = 0

    for (let i = 0; i < n; i++) {
      if (result[i] <= min + 1e-6) {
        result[i] = min
        lockedSum += min
      } else if (result[i] >= max - 1e-6) {
        result[i] = max
        lockedSum += max
      } else {
        free.push(i)
      }
    }

    if (free.length === 0) break

    const remaining = feasible - lockedSum
    const freeSum = free.reduce((s, i) => s + result[i], 0) || 1
    let allInside = true

    for (const i of free) {
      result[i] = (result[i] / freeSum) * remaining
      if (result[i] < min - 1e-6 || result[i] > max + 1e-6) {
        allInside = false
      }
    }

    if (allInside) break
  }

  return result.map((v) => Math.min(max, Math.max(min, v)))
}

function heuristicVocalWindow(durationSec: number, verseCount: number): VocalWindow {
  const bounds = resolveIntroOutroBounds(verseCount, durationSec)
  return {
    vocalStartSec: bounds.start,
    vocalEndSec: bounds.end,
    gaps: [],
  }
}

function computeBandEnergy(
  channelData: Float32Array,
  sampleRate: number,
  windowSec = 0.08,
): number[] {
  const windowSize = Math.max(256, Math.floor(sampleRate * windowSec))
  const energies: number[] = []

  for (let i = 0; i + windowSize < channelData.length; i += windowSize) {
    let sum = 0
    // Aproximação da banda vocal: enfatiza amostras com variação média
    // (proxy leve sem FFT completa — funciona bem para intros/outros).
    for (let j = i; j < i + windowSize; j++) {
      const sample = channelData[j]
      sum += sample * sample
    }
    energies.push(Math.sqrt(sum / windowSize))
  }

  return energies
}

/**
 * Analisa o áudio para achar início/fim vocal e pausas instrumentais > 2.5s.
 * Fallback seguro se o stream não permitir decodificação.
 */
export async function analyzeVocalWindow(options: {
  durationSec: number
  audioUrl?: string | null
  audioElement?: HTMLAudioElement | null
  verseCount?: number
}): Promise<VocalWindow> {
  const durationSec = Math.max(options.durationSec || 0, 1)
  const verseCount = options.verseCount ?? 20
  const fallback = heuristicVocalWindow(durationSec, verseCount)

  const url =
    options.audioUrl ||
    options.audioElement?.currentSrc ||
    options.audioElement?.src ||
    null

  if (!url || typeof window === 'undefined') return fallback

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AudioCtx) return fallback

    const response = await fetch(url)
    if (!response.ok) return fallback
    const arrayBuffer = await response.arrayBuffer()

    const context = new AudioCtx()
    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0))
    } finally {
      void context.close().catch(() => undefined)
    }

    const channel = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const energies = computeBandEnergy(channel, sampleRate, 0.1)
    if (energies.length < 8) return fallback

    const sorted = [...energies].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length * 0.5)] || 0
    const p75 = sorted[Math.floor(sorted.length * 0.75)] || median
    const activeThreshold = Math.max(median * 1.35, p75 * 0.55, 0.004)
    const windowSec = audioBuffer.duration / energies.length

    let vocalStartIdx = 0
    for (let i = 0; i < energies.length; i++) {
      let sustained = 0
      for (let j = i; j < Math.min(energies.length, i + 4); j++) {
        if (energies[j] >= activeThreshold) sustained += 1
      }
      if (sustained >= 3) {
        vocalStartIdx = i
        break
      }
    }

    let vocalEndIdx = energies.length - 1
    for (let i = energies.length - 1; i >= 0; i--) {
      let sustained = 0
      for (let j = i; j > Math.max(-1, i - 4); j--) {
        if (energies[j] >= activeThreshold) sustained += 1
      }
      if (sustained >= 3) {
        vocalEndIdx = i
        break
      }
    }

    const vocalStartSec = Math.min(
      Math.max(vocalStartIdx * windowSec, 0),
      durationSec * 0.45,
    )
    const vocalEndSec = Math.max(
      Math.min((vocalEndIdx + 1) * windowSec, durationSec),
      vocalStartSec + Math.min(20, durationSec * 0.35),
    )

    const gaps: Array<{ start: number; end: number }> = []
    let gapStart: number | null = null
    const quietThreshold = activeThreshold * 0.45

    for (let i = vocalStartIdx; i <= vocalEndIdx; i++) {
      const t = i * windowSec
      if (energies[i] < quietThreshold) {
        if (gapStart == null) gapStart = t
      } else if (gapStart != null) {
        const gapEnd = t
        if (gapEnd - gapStart >= 2.5) {
          gaps.push({ start: gapStart, end: gapEnd })
        }
        gapStart = null
      }
    }

    return {
      vocalStartSec,
      vocalEndSec,
      gaps,
    }
  } catch {
    return fallback
  }
}

/**
 * Distribui timestamps na janela vocal com:
 * - tags/@adlibs em 1.1–1.6s
 * - cadência por sílabas + pontuação
 * - pausas de estrofe e gaps instrumentais > 2.5s
 */
export function generateSmartSync(
  plainLyrics: string,
  durationSec: number,
  vocalWindow?: VocalWindow | null,
): { lines: LyricLine[]; isEstimated: true } {
  // Remove Order:/nomes de cypher e marcadores [Intro]/[Verse]/etc.
  // para a 1ª linha iluminada ser sempre o primeiro verso cantado.
  const cleaned = stripStructuralLabels(stripCypherOrderBlock(plainLyrics))
  const entries = parseSungLinesWithStanzas(cleaned)

  if (entries.length === 0) {
    return { lines: [], isEstimated: true }
  }

  const safeDuration = Math.max(
    durationSec > 0 ? durationSec : entries.length * 3.5,
    30,
  )

  const window =
    vocalWindow &&
    vocalWindow.vocalEndSec > vocalWindow.vocalStartSec
      ? vocalWindow
      : heuristicVocalWindow(safeDuration, entries.length)

  const start = Math.max(0, window.vocalStartSec)
  const end = Math.min(safeDuration, Math.max(window.vocalEndSec, start + 1))
  let usableDuration = Math.max(end - start, 1)

  const gaps = (window.gaps ?? [])
    .map((gap) => ({
      start: Math.max(gap.start, start),
      end: Math.min(gap.end, end),
    }))
    .filter((gap) => gap.end - gap.start >= 2.5)

  const gapBudget = gaps.reduce((sum, gap) => sum + (gap.end - gap.start), 0)
  usableDuration = Math.max(usableDuration - gapBudget * 0.85, entries.length)

  const lineWeights = equalizeChorusWeights(entries)
  const fixedTagDurs = entries.map((entry) =>
    entry.kind === 'tag' ? shortTagDuration(entry.text) : 0,
  )
  const tagBudget = fixedTagDurs.reduce((sum, d) => sum + d, 0)

  const pauseWeights = entries.map((entry, index) => {
    let weight = entry.stanzaBreakBefore ? STANZA_PAUSE_WEIGHT : 0
    // Anexa gaps instrumentais às quebras de estrofe mais próximas
    if (entry.stanzaBreakBefore && gaps.length > 0) {
      const relative = index / Math.max(entries.length - 1, 1)
      const gap = gaps[Math.min(gaps.length - 1, Math.floor(relative * gaps.length))]
      if (gap) weight += Math.min(4, (gap.end - gap.start) * 0.35)
    }
    return weight
  })

  const verseIndices = entries
    .map((entry, index) => (entry.kind === 'verse' ? index : -1))
    .filter((index) => index >= 0)

  const pauseTotalWeight = pauseWeights.reduce((sum, w) => sum + w, 0)
  const verseWeightSum = verseIndices.reduce(
    (sum, index) => sum + lineWeights[index],
    0,
  )
  const totalWeight = verseWeightSum + pauseTotalWeight || 1

  const pauseDurs = pauseWeights.map(
    (w) => (w / totalWeight) * Math.max(usableDuration - tagBudget, 1),
  )
  const pauseTotal = pauseDurs.reduce((sum, d) => sum + d, 0)
  const linesBudget = Math.max(
    usableDuration - tagBudget - pauseTotal,
    verseIndices.length * MIN_LINE_DURATION,
  )

  const rawVerseDurs = verseIndices.map(
    (index) => (lineWeights[index] / totalWeight) * Math.max(usableDuration - tagBudget, 1),
  )
  const verseDurs = redistributeClamped(
    rawVerseDurs,
    linesBudget,
    MIN_LINE_DURATION,
    MAX_LINE_DURATION,
  )

  const lineDurs = entries.map((entry, index) => {
    if (entry.kind === 'tag') return fixedTagDurs[index]
    const versePos = verseIndices.indexOf(index)
    return versePos >= 0 ? verseDurs[versePos] : MIN_LINE_DURATION
  })

  let cursor = start
  const lines: LyricLine[] = entries.map((entry, index) => {
    cursor += pauseDurs[index]
    const line: LyricLine = {
      time: Number(cursor.toFixed(3)),
      text: entry.text,
    }
    cursor += lineDurs[index]
    return line
  })

  return { lines, isEstimated: true }
}

function withSmartSync(
  plain: string,
  durationSec: number | undefined,
  source: LyricsResult['source'],
  vocalWindow?: VocalWindow | null,
): LyricsResult {
  // Mantém tags/@adlibs para cadência curta; limpa só rótulos vazios extremos
  const estimated = generateSmartSync(plain, durationSec ?? 0, vocalWindow)
  return {
    lines: estimated.lines,
    synced: estimated.lines.length > 0,
    isEstimated: true,
    plainText: plain.trim(),
    source,
  }
}

function syncedFromLrc(
  lrc: string,
  plainText: string | null,
  source: LyricsResult['source'],
): LyricsResult | null {
  // Preserva timestamps LRC originais intactos (só ignora linhas vazias).
  const lines = parseLrc(lrc).filter((line) => line.text.trim().length > 0)
  if (lines.length === 0) return null
  return {
    lines,
    synced: true,
    isEstimated: false,
    plainText: plainText?.trim() || plainText,
    source,
  }
}

function payloadToResult(
  payload: {
    syncedLyrics: string | null
    plainLyrics: string | null
    source: string
    isAiSynced?: boolean
  },
  durationSec: number | undefined,
): LyricsResult | null {
  const synced = payload.syncedLyrics?.trim()
  if (synced) {
    const official = syncedFromLrc(
      synced,
      payload.plainLyrics?.trim() || synced,
      payload.source || 'lrclib',
    )
    if (official) {
      return {
        ...official,
        isEstimated: payload.isAiSynced ? false : official.isEstimated,
        isAiSynced: payload.isAiSynced === true,
        source: payload.isAiSynced
          ? payload.source || 'gemini'
          : official.source,
      }
    }
  }

  const plain = payload.plainLyrics?.trim()
  if (!plain) return null

  // Sincronização inteligente obrigatória para plain (Genius, ovh, SC, lrclib)
  return withSmartSync(plain, durationSec, payload.source || 'backend')
}

function readLyricsCache(trackId: string): CachedLyricsPayload | null {
  try {
    clearLegacyLyricsCache(trackId)
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

/** Força novo smart sync a partir do plainText já carregado. */
export function recalculateSmartSync(
  result: LyricsResult,
  durationSec: number,
  vocalWindow?: VocalWindow | null,
): LyricsResult {
  if (!result.plainText?.trim()) return result
  // LRC real: nunca sobrescreve timestamps oficiais
  if (!result.isEstimated) return result
  const estimated = generateSmartSync(
    result.plainText,
    durationSec,
    vocalWindow,
  )
  return {
    ...result,
    lines: estimated.lines,
    synced: estimated.lines.length > 0,
    isEstimated: true,
  }
}

/** Recalcula com análise acústica da janela vocal (async). */
export async function recalculateSmartSyncWithAudio(
  result: LyricsResult,
  durationSec: number,
  options?: {
    audioUrl?: string | null
    audioElement?: HTMLAudioElement | null
  },
): Promise<LyricsResult> {
  if (!result.plainText?.trim() || !result.isEstimated) return result
  const window = await analyzeVocalWindow({
    durationSec,
    audioUrl: options?.audioUrl,
    audioElement: options?.audioElement,
    verseCount: result.plainText.split(/\r?\n/).filter((l) => l.trim()).length,
  })
  return recalculateSmartSync(result, durationSec, window)
}

export type LyricsTimingState = {
  offsetSeconds: number
}

export function lyricsTimingKey(trackId: string) {
  return `azuri_lyrics_timing_${trackId}`
}

export function readLyricsTiming(trackId: string): LyricsTimingState {
  try {
    const raw = localStorage.getItem(lyricsTimingKey(trackId))
    if (raw) {
      const parsed = JSON.parse(raw) as LyricsTimingState
      if (parsed && typeof parsed.offsetSeconds === 'number') {
        return { offsetSeconds: parsed.offsetSeconds }
      }
    }
    // Compat: offset legado
    const legacy = localStorage.getItem(`azuri_lyrics_offset_${trackId}`)
    if (legacy != null) {
      const value = Number(legacy)
      if (Number.isFinite(value)) return { offsetSeconds: value }
    }
  } catch {
    /* ignore */
  }
  return { offsetSeconds: 0 }
}

export function writeLyricsTiming(
  trackId: string,
  timing: LyricsTimingState,
) {
  try {
    localStorage.setItem(lyricsTimingKey(trackId), JSON.stringify(timing))
    // Mantém espelho legado para compatibilidade
    if (Math.abs(timing.offsetSeconds) < 0.001) {
      localStorage.removeItem(`azuri_lyrics_offset_${trackId}`)
    } else {
      localStorage.setItem(
        `azuri_lyrics_offset_${trackId}`,
        String(timing.offsetSeconds),
      )
    }
  } catch {
    /* ignore quota */
  }
}

/** Limpa cache de letras (v4 + legado) para rebuscar/recalcular. */
export function clearLyricsCache(trackId: string) {
  try {
    localStorage.removeItem(lyricsCacheKey(trackId))
    clearLegacyLyricsCache(trackId)
  } catch {
    /* ignore */
  }
}

function writeLyricsCache(
  trackId: string,
  payload: {
    syncedLyrics: string | null
    plainLyrics: string | null
    source: string
    isAiSynced?: boolean
  },
) {
  try {
    const entry: CachedLyricsPayload = {
      syncedLyrics: payload.syncedLyrics,
      plainLyrics: payload.plainLyrics,
      source: payload.source,
      cachedAt: Date.now(),
      isAiSynced: payload.isAiSynced === true,
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

function persistAndConvert(
  trackId: string,
  data: BackendLyricsPayload,
  durationSec: number | undefined,
): LyricsResult | null {
  if (!data.syncedLyrics?.trim() && !data.plainLyrics?.trim()) {
    return null
  }

  const source = data.source || 'backend'
  writeLyricsCache(trackId, {
    syncedLyrics: data.syncedLyrics,
    plainLyrics: data.plainLyrics,
    source,
  })

  // plainLyrics → generateSmartSync automático (Genius / ovh / lrclib plain)
  return payloadToResult(
    {
      syncedLyrics: data.syncedLyrics,
      plainLyrics: data.plainLyrics,
      source,
    },
    durationSec,
  )
}

export async function fetchLyrics(input: {
  trackId: string
  trackName: string
  artistName: string
  albumName?: string
  durationMs?: number
  signal?: AbortSignal
}): Promise<LyricsResult | null> {
  clearLegacyLyricsCache(input.trackId)

  const durationSec =
    input.durationMs != null && input.durationMs > 0
      ? input.durationMs / 1000
      : undefined

  const customLrc = getCustomLrc(input.trackId)
  if (customLrc) return customLrc

  const custom = getCustomLyrics(input.trackId, durationSec)
  if (custom) return custom

  // Cache local v4 — abertura instantânea sem nova rede
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

    const res = await fetch(`${LYRICS_API}?${params.toString()}`, {
      signal: input.signal,
    })
    if (!res.ok) return null

    const data = (await res.json()) as BackendLyricsPayload
    if (input.signal?.aborted) return null
    if (data.found === false) return null
    return persistAndConvert(input.trackId, data, durationSec)
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') return null
    return null
  }
}

/** Busca manual de candidatos (LRCLIB + Genius). */
export async function searchLyricsCandidates(
  query: string,
): Promise<LyricsSearchCandidate[]> {
  const q = query.trim()
  if (!q) return []

  try {
    const res = await fetch(
      `${LYRICS_SEARCH_API}?q=${encodeURIComponent(q)}`,
    )
    if (!res.ok) return []
    const data = (await res.json()) as { candidates?: LyricsSearchCandidate[] }
    return Array.isArray(data.candidates) ? data.candidates : []
  } catch {
    return []
  }
}

/** Carrega e sincroniza uma versão escolhida pelo utilizador. */
export async function fetchLyricsFromCandidate(input: {
  trackId: string
  candidate: LyricsSearchCandidate
  durationMs?: number
}): Promise<LyricsResult | null> {
  const durationSec =
    input.durationMs != null && input.durationMs > 0
      ? input.durationMs / 1000
      : input.candidate.duration && input.candidate.duration > 0
        ? input.candidate.duration
        : undefined

  try {
    const params = new URLSearchParams({
      source: input.candidate.source,
      id: input.candidate.id,
      title: input.candidate.title,
      artist: input.candidate.artist,
    })
    if (input.candidate.url) params.set('url', input.candidate.url)
    if (durationSec != null && durationSec > 0) {
      params.set('duration', String(Math.round(durationSec)))
    }

    const res = await fetch(`${LYRICS_CANDIDATE_API}?${params.toString()}`)
    if (!res.ok) return null

    const data = (await res.json()) as BackendLyricsPayload
    return persistAndConvert(input.trackId, data, durationSec)
  } catch {
    return null
  }
}

/** Reaplica smart sync quando a duração real do player fica disponível. */
export function refreshEstimatedSync(
  result: LyricsResult,
  durationSec: number,
  vocalWindow?: VocalWindow | null,
): LyricsResult {
  if (!result.isEstimated || !result.plainText || durationSec <= 0) {
    return result
  }
  const estimated = generateSmartSync(
    result.plainText,
    durationSec,
    vocalWindow,
  )
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

/** Linhas limpas para o alinhamento Gemini (texto na ordem, sem timestamps). */
export function getPlainLyricLines(result: LyricsResult): string[] {
  if (result.lines.length > 0) {
    return result.lines.map((line) => line.text.trim()).filter(Boolean)
  }
  if (!result.plainText?.trim()) return []
  return stripStructuralLabels(stripCypherOrderBlock(result.plainText))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export type GeminiSyncOutcome =
  | { status: 'ok'; lyrics: LyricsResult }
  | { status: 'mismatch'; reason?: string }
  | { status: 'failed'; reason?: string }
  | { status: 'aborted' }

/**
 * Alinha a letra ao áudio real via Gemini (POST /api/lyrics/ai-sync).
 * Persiste em azuri_lyrics_v4_* com isAiSynced: true e zera offset local.
 * audioUrl pode ser vazio — o backend resolve o stream por title+artist.
 */
export async function syncLyricsWithGemini(
  track: {
    id: string
    name: string
    artists?: Array<{ name?: string }>
    audioUrl?: string
    streamUrl?: string
    previewUrl?: string
  },
  plainLines: string[],
  currentAudioSrc: string | null | undefined,
  options?: { durationSec?: number; force?: boolean; signal?: AbortSignal },
): Promise<GeminiSyncOutcome> {
  const lines = plainLines.map((line) => line.trim()).filter(Boolean)
  if (!track.id || lines.length === 0) {
    return { status: 'failed', reason: 'Sem versos para alinhar' }
  }

  const audioUrl = (
    currentAudioSrc?.trim() ||
    track.streamUrl?.trim() ||
    track.previewUrl?.trim() ||
    track.audioUrl?.trim() ||
    ''
  ).replace(/^blob:.*/i, '')

  const artist =
    primaryArtistName(
      track.artists?.map((a) => a.name ?? '').filter(Boolean).join(', ') ?? '',
    ) || 'Unknown'

  const durationSec =
    options?.durationSec && options.durationSec > 0
      ? options.durationSec
      : undefined

  try {
    const res = await fetch(LYRICS_AI_SYNC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      body: JSON.stringify({
        title: cleanTrackTitle(track.name) || track.name,
        artist,
        trackId: track.id,
        lines,
        audioUrl,
        force: options?.force === true,
        duration: durationSec,
        durationSec,
      }),
    })

    if (options?.signal?.aborted) return { status: 'aborted' }
    if (!res.ok) return { status: 'failed' }

    const data = (await res.json()) as {
      syncedLines?: LyricLine[]
      source?: string
      fallback?: boolean
      reason?: string
      matchesAudio?: boolean
    }

    if (data.matchesAudio === false) {
      return {
        status: 'mismatch',
        reason:
          data.reason ||
          'A letra encontrada não corresponde ao áudio da faixa.',
      }
    }

    if (data.fallback || !data.syncedLines?.length) {
      return { status: 'failed', reason: data.reason }
    }

    const syncedLines = data.syncedLines
      .map((line) => ({
        time: Number(Number(line.time).toFixed(2)),
        text: String(line.text ?? '').trim(),
      }))
      .filter((line) => line.text && Number.isFinite(line.time) && line.time >= 0)

    if (syncedLines.length === 0) {
      return { status: 'failed', reason: 'Alignments vazios' }
    }

    // Preservar ordem original dos versos (já alinhados 1-para-1 no server)
    const plainText = lines.join('\n')
    const source = data.source || 'gemini'

    writeLyricsCache(track.id, {
      syncedLyrics: linesToLrc(syncedLines),
      plainLyrics: plainText,
      source,
      isAiSynced: true,
    })

    // Offset antigo não pode desalinear o resultado da IA
    writeLyricsTiming(track.id, { offsetSeconds: 0 })

    return {
      status: 'ok',
      lyrics: {
        lines: syncedLines,
        synced: true,
        isEstimated: false,
        isAiSynced: true,
        plainText,
        source,
      },
    }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      return { status: 'aborted' }
    }
    console.error('syncLyricsWithGemini falhou:', error)
    const message =
      error instanceof Error ? error.message : String(error ?? '')
    // Propaga falha de rede para a UI resetar o botão e avisar servidor offline
    if (
      error instanceof TypeError ||
      /failed to fetch|networkerror|load failed|err_connection/i.test(message)
    ) {
      throw error instanceof Error
        ? error
        : new TypeError('Failed to fetch')
    }
    return { status: 'failed' }
  }
}

/** True quando a letra ainda merece upgrade Gemini (sem LRC oficial). */
export function shouldUpgradeWithGemini(result: LyricsResult | null): boolean {
  if (!result || result.lines.length === 0) return false
  if (result.isAiSynced) return false
  if (
    !result.isEstimated &&
    (result.source === 'custom-lrc' ||
      result.source === 'custom' ||
      Boolean(result.source?.includes('lrclib-synced')))
  ) {
    return false
  }
  return true
}
