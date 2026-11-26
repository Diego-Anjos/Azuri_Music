export type LyricsSearchVariant = {
  title: string
  artist: string
  query: string
}

/** Remove tags de produção, feat., remasters, sped/slowed e trechos entre ()/[]. */
export function cleanLyricsTitle(rawTitle: string): string {
  return rawTitle
    .replace(/[\/|｜]/g, ' ')
    .replace(
      /\s*[([{]?\s*(feat\.?|ft\.?|featuring|prod\.?|produced by|prod by)\s+[^)\]}]*[)\]}]?/gi,
      ' ',
    )
    .replace(
      /\s*[([{][^)\]}]*(official|audio|video|lyric|visuali[sz]er|remaster(?:ed)?|radio edit|explicit|clean|sped\s*up|slowed(?:\s*\+?\s*reverb)?|nightcore|instrumental)[^)\]}]*[)\]}]/gi,
      ' ',
    )
    .replace(
      /\s*[-–—]\s*(remaster(?:ed)?|single|official|lyric|audio|video|sped\s*up|slowed|radio edit).*$/i,
      '',
    )
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/[([{}\])]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'.&+-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Extrai o artista principal (antes de ,, &, feat., ft., x)
 * e remove hashtags/tags de coletivo.
 */
export function cleanLyricsArtist(rawArtist: string): string {
  const withoutTags = rawArtist
    .replace(/#\w+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const primary =
    withoutTags
      .split(/\s*(?:,|&| feat\.?| ft\.?| featuring|\sx\s|\sX\s)\s+/i)[0]
      ?.trim() || withoutTags

  return primary.replace(/[^\p{L}\p{N}\s'.&+-]/gu, ' ').replace(/\s{2,}/g, ' ').trim()
}

function variantKey(title: string, artist: string): string {
  return `${artist.toLowerCase()}::${title.toLowerCase()}`
}

/**
 * Gera pares de busca do mais específico ao mais amplo,
 * cobrindo remixes, feat., barras no título e underground.
 */
export function buildSearchVariants(
  rawTitle: string,
  rawArtist: string,
): LyricsSearchVariant[] {
  const variants: LyricsSearchVariant[] = []
  const seen = new Set<string>()

  const push = (title: string, artist: string) => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    const cleanArtist = artist.trim()
    const key = variantKey(cleanTitle, cleanArtist)
    if (seen.has(key)) return
    seen.add(key)
    variants.push({
      title: cleanTitle,
      artist: cleanArtist,
      query: cleanArtist ? `${cleanArtist} ${cleanTitle}` : cleanTitle,
    })
  }

  const titleFull = cleanLyricsTitle(rawTitle)
  const artistPrimary = cleanLyricsArtist(rawArtist)
  const titleFirstSegment = cleanLyricsTitle(
    (rawTitle.split(/[\/|｜]/)[0] ?? rawTitle).trim(),
  )

  // Mais específico → mais amplo
  push(titleFull, artistPrimary)
  if (titleFirstSegment !== titleFull) {
    push(titleFirstSegment, artistPrimary)
  }

  // Artista bruto limpo só de hashtags (pode ajudar Genius/SoundCloud)
  const artistLoose = rawArtist.replace(/#\w+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (artistLoose && artistLoose.toLowerCase() !== artistPrimary.toLowerCase()) {
    push(titleFull, cleanLyricsArtist(artistLoose))
  }

  // Só título
  push(titleFull, '')
  if (titleFirstSegment !== titleFull) {
    push(titleFirstSegment, '')
  }

  // Fallback: títulos quase crus (só espaços normalizados) se limpeza esvaziou
  if (variants.length === 0) {
    const fallbackTitle = rawTitle.replace(/\s{2,}/g, ' ').trim()
    const fallbackArtist = artistPrimary || rawArtist.trim()
    push(fallbackTitle, fallbackArtist)
    push(fallbackTitle, '')
  }

  return variants
}

/** Similaridade por sobreposição de tokens (0–1). */
export function tokenSimilarity(a: string, b: string): number {
  const tokenize = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean),
    )

  const A = tokenize(a)
  const B = tokenize(b)
  if (A.size === 0 || B.size === 0) return 0

  let inter = 0
  for (const token of A) {
    if (B.has(token)) inter += 1
  }
  return inter / Math.max(A.size, B.size)
}

export function durationClose(
  candidateSec: number | null | undefined,
  targetSec: number | null | undefined,
  tolerance = 5,
): boolean {
  if (targetSec == null || targetSec <= 0) return true
  if (candidateSec == null || candidateSec <= 0) return true
  return Math.abs(candidateSec - targetSec) <= tolerance
}

/** Normaliza artista para comparação: minúsculas, sem acentos/feat/#tags. */
export function normalizeArtistForMatch(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/#\w+/g, ' ')
    .replace(/\b(feat\.?|ft\.?|featuring|prod\.?|produced by|prod by)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Exige que o artista candidato seja compatível com o esperado.
 * Pelo menos uma palavra-chave principal OU similaridade de tokens ≥ 0.5.
 */
export function isArtistMatch(
  expectedArtist: string,
  candidateArtist: string,
): boolean {
  const expected = normalizeArtistForMatch(expectedArtist)
  const candidate = normalizeArtistForMatch(candidateArtist)
  if (!expected || !candidate) return false
  if (expected === candidate) return true
  if (candidate.includes(expected) || expected.includes(candidate)) return true

  const expectedTokens = expected.split(/\s+/).filter(Boolean)
  const candidateTokens = new Set(candidate.split(/\s+/).filter(Boolean))
  const significant = expectedTokens.filter(
    (token) => token.length >= 3 || expectedTokens.length === 1,
  )

  const hasKeyword = significant.some(
    (token) => candidateTokens.has(token) || candidate.includes(token),
  )
  if (hasKeyword) return true

  return tokenSimilarity(expected, candidate) >= 0.5
}

/**
 * Normalização estrita de título para match de letras:
 * remove só tags técnicas (Official Audio, Visualizer, prod…);
 * mantém Pt. 2, Remix, anos e números relevantes.
 */
export function normalizeStrictTitle(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(
      /\s*[([{]?\s*(feat\.?|ft\.?|featuring|prod\.?|produced by|prod by)\s+[^)\]}]*[)\]}]?/gi,
      ' ',
    )
    .replace(
      /\s*[([{][^)\]}]*(official(?:\s+(?:audio|video|music\s*video|lyric\s*video))?|lyrics?|audio|visuali[sz]er|topic|hd|4k|mv|explicit|clean|remaster(?:ed)?)[^)\]}]*[)\]}]/gi,
      ' ',
    )
    .replace(
      /\s*[-–—]\s*(official(?:\s+\w+)?|lyric(?:s)?|audio|video|visuali[sz]er).*$/i,
      '',
    )
    .replace(/[^\p{L}\p{N}\s'.&+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TRANSLATION_META_TERMS = [
  'translations',
  'traduções',
  'traducciones',
  'traductions',
  'übersetzungen',
  'ubersetzungen',
  'tradução',
  'traducao',
  '日本語訳',
  '한국어',
  'romanized',
  'romanização',
  'romanizacao',
  'translated',
  'genius brasil',
  'genius japanese',
  'genius korea',
  'genius translations',
] as const

/**
 * Detecta páginas/metadados de tradução Genius (e similares).
 * Só rejeita se o termo NÃO fizer parte do título original esperado.
 */
export function isTranslationMetadata(
  text: string,
  expectedTitle?: string,
): boolean {
  const hay = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (!hay) return false

  const expected = (expectedTitle ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

  for (const term of TRANSLATION_META_TERMS) {
    if (hay.includes(term) && !expected.includes(term)) return true
  }
  return false
}

/**
 * Match rigoroso título (≥85% tokens ou exato) + artista principal confirmado.
 * Impede puxar outra faixa parecida do mesmo artista ou página de tradução.
 */
export function isStrictTrackMatch(
  expectedTitle: string,
  expectedArtist: string,
  candidateTitle: string,
  candidateArtist: string,
): boolean {
  if (!expectedTitle?.trim() || !candidateTitle?.trim()) return false
  if (!isArtistMatch(expectedArtist, candidateArtist)) return false

  if (
    isTranslationMetadata(candidateTitle, expectedTitle) ||
    isTranslationMetadata(candidateArtist, expectedTitle)
  ) {
    return false
  }

  const expected = normalizeStrictTitle(expectedTitle)
  const candidate = normalizeStrictTitle(candidateTitle)
  if (!expected || !candidate) return false
  if (expected === candidate) return true
  return tokenSimilarity(expected, candidate) >= 0.85
}

/**
 * Rejeita press-releases, links comerciais e tracklists de vinil/álbum.
 */
export function isValidLyricsText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed === '♪ Instrumental ♪') return true

  const lower = trimmed.toLowerCase()

  if (/https?:\/\//i.test(trimmed)) return false
  if (
    /\b(lnk\.to|spotify\.com|soundcloud\.com|youtube\.com|youtu\.be|bandcamp\.com)\b/i.test(
      lower,
    )
  ) {
    return false
  }

  if (
    /\b(pre-?order\s*:|release date\s*:|format\s*:\s*digital|tracklist\s*:|catalogue\s*:|catalog\s*:|label\s*:)\b/i.test(
      lower,
    )
  ) {
    return false
  }

  if (/\bvinyl\b/i.test(lower) && /\b(format|release|pre-?order|tracklist)\b/i.test(lower)) {
    return false
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const tracklistLines = lines.filter((line) =>
    /^(?:[AB]\d*|[0-9]{1,2})\s*[-.)]\s+\S+/i.test(line) ||
    /^[AB]\s*-\s+\S+/i.test(line),
  )
  if (tracklistLines.length >= 3) return false

  return true
}
