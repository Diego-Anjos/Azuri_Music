import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleGenAI, Type } from '@google/genai'
import type { Request, Response } from 'express'

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = resolve(SERVER_ROOT, 'cache')
const CACHE_FILE = resolve(CACHE_DIR, 'ai-lyrics.json')
const MAX_AUDIO_BYTES = 20 * 1024 * 1024

function localOrigin() {
  return `http://localhost:${Number(process.env.PORT) || 3001}`
}

export type AiSyncedLine = { time: number; text: string }

type AiSyncCacheStore = Record<
  string,
  { syncedLines: AiSyncedLine[]; cachedAt: number }
>

const memoryCache = new Map<string, AiSyncedLine[]>()

function cacheKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`
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
    console.warn('Falha ao gravar cache AI lyrics:', error)
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
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const origin = localOrigin()
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`
  return `${origin}/${trimmed}`
}

function detectMimeType(
  contentType: string | null,
  url: string,
): string {
  const ct = (contentType ?? '').split(';')[0]?.trim().toLowerCase()
  if (
    ct === 'audio/mpeg' ||
    ct === 'audio/mp4' ||
    ct === 'audio/webm' ||
    ct === 'audio/ogg' ||
    ct === 'audio/wav' ||
    ct === 'audio/x-wav' ||
    ct === 'audio/mp3'
  ) {
    if (ct === 'audio/mp3' || ct === 'audio/x-wav') {
      return ct === 'audio/mp3' ? 'audio/mpeg' : 'audio/wav'
    }
    return ct
  }

  const lower = url.toLowerCase()
  if (lower.includes('.m4a') || lower.includes('.mp4')) return 'audio/mp4'
  if (lower.includes('.webm')) return 'audio/webm'
  if (lower.includes('.ogg') || lower.includes('.oga')) return 'audio/ogg'
  if (lower.includes('.wav')) return 'audio/wav'
  return 'audio/mpeg'
}

async function downloadAudioAsBase64(
  audioUrl: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const url = resolveAudioFetchUrl(audioUrl)
  if (!url) return null

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'audio/*,*/*;q=0.9',
    },
  })

  if (!response.ok) {
    console.error('Falha ao baixar áudio para AI sync:', response.status, url)
    return null
  }

  const mimeType = detectMimeType(response.headers.get('content-type'), url)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_AUDIO_BYTES) {
    console.error(
      'Áudio inválido/grande demais para AI sync:',
      buffer.byteLength,
    )
    return null
  }

  return { base64: buffer.toString('base64'), mimeType }
}

function validateSyncedLines(
  inputLines: string[],
  rawLines: Array<{ time?: unknown; text?: unknown }>,
  durationSec?: number | null,
): AiSyncedLine[] | null {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return null

  const times = rawLines.map((line) => Number(line?.time))
  if (times.some((t) => !Number.isFinite(t) || t < 0)) return null

  // Preferir textos originais na mesma ordem; tempos do modelo
  const count = Math.min(inputLines.length, times.length)
  if (count < Math.max(3, Math.floor(inputLines.length * 0.6))) return null

  const maxTime =
    durationSec && durationSec > 0 ? durationSec + 2 : Number.POSITIVE_INFINITY

  const synced: AiSyncedLine[] = []
  let previous = -0.01

  for (let i = 0; i < count; i++) {
    let time = Number(times[i].toFixed(2))
    if (time < previous) time = Number((previous + 0.05).toFixed(2))
    if (time > maxTime) return null
    synced.push({ time, text: inputLines[i] })
    previous = time
  }

  // Se Gemini devolveu menos linhas, completa com passos curtos
  if (synced.length < inputLines.length) {
    let cursor = synced[synced.length - 1]?.time ?? 0
    for (let i = synced.length; i < inputLines.length; i++) {
      cursor = Number((cursor + 1.8).toFixed(2))
      if (cursor > maxTime) break
      synced.push({ time: cursor, text: inputLines[i] })
    }
  }

  return synced.length > 0 ? synced : null
}

function buildAlignmentPrompt(title: string, artist: string, lines: string[]) {
  const numbered = lines.map((line, i) => `${i + 1}. ${line}`).join('\n')
  return `Ouça atentamente a faixa de áudio e alinhe cada linha da letra fornecida com o momento exato (em segundos, com duas casas decimais) em que o vocalista começa a cantar aquela linha. Ignore intros instrumentais, pausas de beat e tags não cantadas. Mantenha exatamente o texto de cada linha na mesma ordem.

Faixa: "${title}" — ${artist}

Linhas da letra (na ordem):
${numbered}

Responda apenas JSON no formato { "lines": [{ "time": number, "text": string }] } com uma entrada por linha, na mesma ordem.`
}

export async function handleAiLyricsSync(req: Request, res: Response) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      res.status(200).json({ fallback: true, reason: 'GEMINI_API_KEY ausente' })
      return
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const artist =
      typeof req.body?.artist === 'string' ? req.body.artist.trim() : ''
    const audioUrl =
      typeof req.body?.audioUrl === 'string' ? req.body.audioUrl.trim() : ''
    const lines = Array.isArray(req.body?.lines)
      ? (req.body.lines as unknown[])
          .map((line) => (typeof line === 'string' ? line.trim() : ''))
          .filter(Boolean)
      : []
    const durationSec =
      typeof req.body?.durationSec === 'number' &&
      Number.isFinite(req.body.durationSec) &&
      req.body.durationSec > 0
        ? Number(req.body.durationSec)
        : null
    const force = req.body?.force === true

    if (!title || !artist || !audioUrl || lines.length === 0) {
      res.status(200).json({
        fallback: true,
        reason: 'Parâmetros title, artist, lines e audioUrl são obrigatórios',
      })
      return
    }

    if (!force) {
      const cached = readCachedLines(artist, title)
      if (cached) {
        res.status(200).json({
          syncedLines: cached,
          source: 'gemini-cached',
        })
        return
      }
    }

    const audio = await downloadAudioAsBase64(audioUrl)
    if (!audio) {
      res.status(200).json({
        fallback: true,
        reason: 'Não foi possível capturar o áudio da faixa',
      })
      return
    }

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
            lines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.NUMBER },
                  text: { type: Type.STRING },
                },
                required: ['time', 'text'],
              },
            },
          },
          required: ['lines'],
        },
      },
    })

    const rawText = response.text?.trim()
    if (!rawText) {
      res.status(200).json({ fallback: true, reason: 'Resposta vazia do Gemini' })
      return
    }

    let parsed: { lines?: Array<{ time?: unknown; text?: unknown }> }
    try {
      parsed = JSON.parse(rawText) as typeof parsed
    } catch {
      res.status(200).json({
        fallback: true,
        reason: 'JSON inválido retornado pelo Gemini',
      })
      return
    }

    const syncedLines = validateSyncedLines(
      lines,
      parsed.lines ?? [],
      durationSec,
    )
    if (!syncedLines) {
      res.status(200).json({
        fallback: true,
        reason: 'Timestamps inválidos ou fora de ordem',
      })
      return
    }

    writeCachedLines(artist, title, syncedLines)
    res.status(200).json({
      syncedLines,
      source: 'gemini',
    })
  } catch (error) {
    console.error('Erro em /api/lyrics/ai-sync:', error)
    res.status(200).json({
      fallback: true,
      reason: 'Falha interna no alinhamento Gemini',
    })
  }
}
