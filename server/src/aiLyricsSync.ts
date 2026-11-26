import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleGenAI, Type } from '@google/genai'
import type { Request, Response } from 'express'
import play from 'play-dl'

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = resolve(SERVER_ROOT, 'cache')
const CACHE_FILE = resolve(CACHE_DIR, 'ai-lyrics.json')
const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const MIN_AUDIO_BYTES = 10_000
const MIN_GAP_SEC = 0.15

function serverPort() {
  return Number(process.env.PORT) || 3001
}

function localOrigin() {
  return `http://localhost:${serverPort()}`
}

export type AiSyncedLine = { time: number; text: string }

type AiSyncCacheStore = Record<
  string,
  { syncedLines: AiSyncedLine[]; cachedAt: number }
>

const memoryCache = new Map<string, AiSyncedLine[]>()

function cacheKey(artist: string, title: string): string {
  // v4 — invalida alinhamentos antigos (possível letra errada / tradução)
  return `v4::${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`
}

function loadDiskCache(): AiSyncCacheStore {
  try {
    if (!existsSync(CACHE_FILE)) return {}
    const raw = readFileSync(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as AiSyncCacheStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistDiskCache(store: AiSyncCacheStore) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), 'utf8')
  } catch (error) {
    console.warn('[AI-Sync] Falha ao gravar cache:', error)
  }
}

function readCachedLines(artist: string, title: string): AiSyncedLine[] | null {
  const key = cacheKey(artist, title)
  const mem = memoryCache.get(key)
  if (mem?.length) return mem

  const disk = loadDiskCache()[key]
  if (disk?.syncedLines?.length) {
    memoryCache.set(key, disk.syncedLines)
    return disk.syncedLines
  }
  return null
}

function writeCachedLines(
  artist: string,
  title: string,
  syncedLines: AiSyncedLine[],
) {
  const key = cacheKey(artist, title)
  memoryCache.set(key, syncedLines)
  const store = loadDiskCache()
  store[key] = { syncedLines, cachedAt: Date.now() }
  persistDiskCache(store)
}

function resolveAudioFetchUrl(audioUrl: string): string {
  const trimmed = audioUrl.trim()
  if (!trimmed) return ''
  if (/^blob:/i.test(trimmed)) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const origin = localOrigin()
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`
  return `${origin}/${trimmed}`
}

function detectMimeType(contentType: string | null, url: string): string {
  const ct = (contentType ?? '').split(';')[0]?.trim().toLowerCase()
  if (ct === 'audio/mp3') return 'audio/mpeg'
  if (
    ct === 'audio/mpeg' ||
    ct === 'audio/mp4' ||
    ct === 'audio/webm' ||
    ct === 'audio/ogg' ||
    ct === 'audio/wav'
  ) {
    return ct
  }

  const lower = url.toLowerCase()
  if (lower.includes('.m4a') || lower.includes('.mp4') || /mime=audio%2Fmp4/i.test(lower)) {
    return 'audio/mp4'
  }
  if (lower.includes('.webm') || /mime=audio%2Fwebm/i.test(lower)) return 'audio/webm'
  if (lower.includes('.ogg') || lower.includes('.oga')) return 'audio/ogg'
  if (lower.includes('.wav')) return 'audio/wav'
  return 'audio/mpeg'
}

function isHtmlContentType(contentType: string | null): boolean {
  const ct = (contentType ?? '').toLowerCase()
  return ct.includes('text/html') || ct.includes('application/xhtml')
}

function isValidAudioBuffer(
  buffer: Buffer,
  contentType: string | null,
): boolean {
  if (buffer.byteLength <= MIN_AUDIO_BYTES) return false
  if (buffer.byteLength > MAX_AUDIO_BYTES) return false
  if (isHtmlContentType(contentType)) return false
  // Assinatura HTML óbvia
  const head = buffer.subarray(0, 64).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return false
  return true
}

async function downloadUrlToAudio(
  url: string,
): Promise<{ base64: string; mimeType: string; bytes: number } | null> {
  if (!url) return null

  console.log(`[AI-Sync] Baixando áudio: ${url.slice(0, 120)}…`)
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'audio/*,*/*;q=0.9',
    },
  })

  if (!response.ok && response.status !== 206) {
    console.warn(`[AI-Sync] Download HTTP ${response.status}`)
    return null
  }

  const contentType = response.headers.get('content-type')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!isValidAudioBuffer(buffer, contentType)) {
    console.warn(
      `[AI-Sync] Buffer inválido (${buffer.byteLength} bytes, ct=${contentType})`,
    )
    return null
  }

  const mimeType = detectMimeType(contentType, url)
  return {
    base64: buffer.toString('base64'),
    mimeType,
    bytes: buffer.byteLength,
  }
}

function resolveDirectAudioUrl(videoUrl: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const args = [
      '-m',
      'yt_dlp',
      '-f',
      'bestaudio[abr<=160]/bestaudio',
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
        resolvePromise(url)
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

function stripAiSyncQuerySuffixes(query: string): string {
  return query
    .replace(
      /\b(official\s*(audio|video|music\s*video)?|lyrics?|audio|mv|hd|4k|visualizer|topic)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mesma cascata interna do /api/stream: play-dl search → yt-dlp → bytes. */
async function fetchInternalTrackAudio(
  title: string,
  artist: string,
  trackId?: string,
): Promise<{ base64: string; mimeType: string; bytes: number } | null> {
  const baseQuery = [artist, title].filter(Boolean).join(' ').trim()
  if (!baseQuery) return null

  console.log(`[AI-Sync] Fallback interno de stream para "${baseQuery}"`)

  const stripped = stripAiSyncQuerySuffixes(baseQuery)
  const searchVariants = [
    `${baseQuery} audio`,
    baseQuery,
    stripped && stripped.toLowerCase() !== baseQuery.toLowerCase()
      ? stripped
      : null,
    trackId ? `${baseQuery} ${trackId}` : null,
  ].filter((item): item is string => Boolean(item))

  // 1) Via proxy local /api/stream (reusa o pipeline do server + fallbacks de busca)
  for (const variant of searchVariants) {
    const params = new URLSearchParams({
      query: variant,
      quality: 'normal',
    })
    if (title) params.set('title', title)
    if (artist) params.set('artist', artist)
    const proxyUrl = `${localOrigin()}/api/stream?${params.toString()}`
    const viaProxy = await downloadUrlToAudio(proxyUrl)
    if (viaProxy) return viaProxy
  }

  // 2) Direto: YouTube search + yt-dlp (title + artist → buffer MP3/M4A)
  for (const variant of searchVariants) {
    try {
      const results = await play.search(variant, {
        limit: 1,
        source: { youtube: 'video' },
      })
      const first = Array.isArray(results) ? results[0] : undefined
      if (!first?.id) continue

      const videoUrl = `https://www.youtube.com/watch?v=${first.id}`
      const directUrl = await resolveDirectAudioUrl(videoUrl)
      const downloaded = await downloadUrlToAudio(directUrl)
      if (downloaded) return downloaded
    } catch (error) {
      console.warn(
        `[AI-Sync] Fallback YouTube/yt-dlp falhou para "${variant}":`,
        error,
      )
    }
  }

  console.warn('[AI-Sync] Nenhum resultado de áudio para fallback interno')
  return null
}

async function captureAudio(options: {
  audioUrl: string
  title: string
  artist: string
  trackId?: string
}): Promise<{ base64: string; mimeType: string; bytes: number } | null> {
  const resolved = resolveAudioFetchUrl(options.audioUrl)
  if (resolved) {
    const downloaded = await downloadUrlToAudio(resolved)
    if (downloaded) return downloaded
    console.warn('[AI-Sync] Download de audioUrl falhou — tentando stream interno')
  } else if (options.audioUrl) {
    console.warn(
      `[AI-Sync] audioUrl inválido/blob ("${options.audioUrl.slice(0, 40)}") — stream interno`,
    )
  } else {
    console.warn('[AI-Sync] audioUrl vazio — stream interno')
  }

  return fetchInternalTrackAudio(options.title, options.artist, options.trackId)
}

function parseDuration(body: Record<string, unknown>): number | null {
  const raw = body.duration ?? body.durationSec
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/**
 * Reconstrói syncedLines 1-para-1 com o texto original.
 * Interpola índices ausentes e força ordem crescente (gap ≥ 0.15s).
 */
function rebuildSyncedLines(
  inputLines: string[],
  alignments: Array<{ index?: unknown; startTime?: unknown }>,
  durationSec: number | null,
): AiSyncedLine[] | null {
  if (inputLines.length === 0) return null

  const byIndex = new Map<number, number>()
  for (const row of alignments) {
    const index = Number(row?.index)
    const startTime = Number(row?.startTime)
    if (!Number.isInteger(index) || index < 0 || index >= inputLines.length) {
      continue
    }
    if (!Number.isFinite(startTime) || startTime < 0) continue
    byIndex.set(index, startTime)
  }

  if (byIndex.size === 0) return null

  const maxTime =
    durationSec && durationSec > 0 ? durationSec : Number.POSITIVE_INFINITY
  const times: Array<number | null> = inputLines.map((_, i) =>
    byIndex.has(i) ? byIndex.get(i)! : null,
  )

  // Interpolação linear entre âncoras conhecidas
  let i = 0
  while (i < times.length) {
    if (times[i] != null) {
      i++
      continue
    }
    let j = i
    while (j < times.length && times[j] == null) j++
    const left = i > 0 ? times[i - 1] : null
    const right = j < times.length ? times[j] : null
    const gap = j - i + 1

    for (let k = i; k < j; k++) {
      if (left != null && right != null) {
        const t =
          left + ((right - left) * (k - i + 1)) / gap
        times[k] = t
      } else if (left != null) {
        times[k] = left + (k - i + 1) * 1.8
      } else if (right != null) {
        times[k] = Math.max(0, right - (j - k) * 1.8)
      } else {
        times[k] = k * 2
      }
    }
    i = j
  }

  const synced: AiSyncedLine[] = []
  let prev = -MIN_GAP_SEC

  for (let idx = 0; idx < inputLines.length; idx++) {
    let time = Number(times[idx] ?? 0)
    if (!Number.isFinite(time) || time < 0) time = prev + MIN_GAP_SEC
    if (time < prev + MIN_GAP_SEC) time = prev + MIN_GAP_SEC

    const remaining = inputLines.length - idx - 1
    if (Number.isFinite(maxTime) && time > maxTime) {
      time = Math.max(prev + MIN_GAP_SEC, maxTime - remaining * MIN_GAP_SEC)
    }

    time = Number(time.toFixed(2))
    synced.push({ time, text: inputLines[idx] })
    prev = time
  }

  return synced
}

function buildAlignmentPrompt(title: string, artist: string, lines: string[]) {
  const numbered = lines.map((line, i) => `${i}: ${line}`).join('\n')
  return `Ouça atentamente a faixa de áudio completa e alinhe CADA índice da letra com o segundo exato (startTime, número decimal) em que a voz começa a cantar aquela linha.

Ignore intros instrumentais, beats sem voz, tags estruturais e ad-libs não listados.
Use exatamente os índices fornecidos (0…${lines.length - 1}). Não invente linhas novas e não omita índices se a linha for cantada.

IMPORTANTE — compatibilidade áudio↔letra:
Retorne matchesAudio: true somente se a letra fornecida corresponder claramente à música ouvida.
Retorne matchesAudio: false se a letra for claramente de outra música, for tradução intercalada, ou não bater com o que se ouve no áudio.
Se matchesAudio for false, ainda assim pode devolver alignments vazios.

Faixa: "${title}" — ${artist}

Versos numerados:
${numbered}

Responda apenas JSON: { "matchesAudio": boolean, "alignments": [{ "index": number, "startTime": number }] }`
}

export async function handleAiLyricsSync(req: Request, res: Response) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      res.status(200).json({ fallback: true, reason: 'GEMINI_API_KEY ausente' })
      return
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const artist = typeof body.artist === 'string' ? body.artist.trim() : ''
    const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() : ''
    const trackId =
      typeof body.trackId === 'string' ? body.trackId.trim() : undefined
    const lines = Array.isArray(body.lines)
      ? (body.lines as unknown[])
          .map((line) => (typeof line === 'string' ? line.trim() : ''))
          .filter(Boolean)
      : []
    const durationSec = parseDuration(body)
    const force = body.force === true

    console.log(
      `[AI-Sync] Iniciando sincronização de "${title}" - "${artist}"…`,
    )

    if (!title || !artist || lines.length === 0) {
      res.status(200).json({
        fallback: true,
        reason: 'Parâmetros title, artist e lines são obrigatórios',
      })
      return
    }

    if (!force) {
      const cached = readCachedLines(artist, title)
      if (cached) {
        console.log(
          `[AI-Sync] Cache hit (${cached.length} versos) para "${title}"`,
        )
        res.status(200).json({
          syncedLines: cached,
          source: 'gemini-cached',
        })
        return
      }
    }

    const audio = await captureAudio({ audioUrl, title, artist, trackId })
    if (!audio) {
      console.warn('[AI-Sync] Não foi possível obter bytes de áudio válidos')
      res.status(200).json({
        fallback: true,
        reason: 'Não foi possível capturar o áudio da faixa',
      })
      return
    }

    console.log(
      `[AI-Sync] Áudio OK (${audio.bytes} bytes, ${audio.mimeType}) — chamando Gemini…`,
    )

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: audio.base64,
                mimeType: audio.mimeType,
              },
            },
            {
              text: buildAlignmentPrompt(title, artist, lines),
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchesAudio: { type: Type.BOOLEAN },
            alignments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.NUMBER },
                  startTime: { type: Type.NUMBER },
                },
                required: ['index', 'startTime'],
              },
            },
          },
          required: ['matchesAudio', 'alignments'],
        },
      },
    })

    const rawText = response.text?.trim()
    if (!rawText) {
      res.status(200).json({ fallback: true, reason: 'Resposta vazia do Gemini' })
      return
    }

    let parsed: {
      matchesAudio?: boolean
      alignments?: Array<{ index?: unknown; startTime?: unknown }>
    }
    try {
      parsed = JSON.parse(rawText) as typeof parsed
    } catch {
      res.status(200).json({
        fallback: true,
        reason: 'JSON inválido retornado pelo Gemini',
      })
      return
    }

    if (parsed.matchesAudio === false) {
      console.warn(
        `[AI-Sync] matchesAudio=false — letra não corresponde ao áudio de "${title}"`,
      )
      res.status(200).json({
        matchesAudio: false,
        syncedLines: [],
        fallback: true,
        reason:
          'A letra encontrada não corresponde ao áudio da faixa. Tente trocar/buscar outra versão.',
      })
      return
    }

    const syncedLines = rebuildSyncedLines(
      lines,
      parsed.alignments ?? [],
      durationSec,
    )
    if (!syncedLines) {
      res.status(200).json({
        fallback: true,
        reason: 'Alignments inválidos ou insuficientes',
      })
      return
    }

    writeCachedLines(artist, title, syncedLines)
    console.log(
      `[AI-Sync] Concluído com sucesso (${syncedLines.length} versos)`,
    )

    res.status(200).json({
      syncedLines,
      source: 'gemini',
      matchesAudio: true,
    })
  } catch (error) {
    console.error('[AI-Sync] Erro interno:', error)
    res.status(200).json({
      fallback: true,
      reason: 'Falha interna no alinhamento Gemini',
    })
  }
}
