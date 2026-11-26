export const AUDIO_SETTINGS_KEY = 'azuri_audio_settings'
export const AUDIO_SETTINGS_UPDATED_EVENT = 'azuri-settings-updated'

export type AudioQuality = 'low' | 'medium' | 'high' | 'ultra'

export type EqPreset =
  | 'flat'
  | 'bass_boost'
  | 'underground'
  | 'vocal'
  | 'electronic'
  | 'custom'

export type EqBands = {
  subBass: number
  bass: number
  mid: number
  presence: number
  treble: number
}

export type AudioSettings = {
  quality: AudioQuality
  eqPreset: EqPreset
  eqBands: EqBands
  bassBoost: boolean
  normalizeVolume: boolean
  crossfadeSeconds: number
  autoplaySimilar: boolean
}

export const EQ_BAND_META = [
  { key: 'subBass' as const, label: '60Hz', hint: 'Sub-Grave' },
  { key: 'bass' as const, label: '230Hz', hint: 'Grave' },
  { key: 'mid' as const, label: '910Hz', hint: 'Médio' },
  { key: 'presence' as const, label: '3.6kHz', hint: 'Presença' },
  { key: 'treble' as const, label: '14kHz', hint: 'Agudo' },
]

export const QUALITY_OPTIONS: Array<{
  id: AudioQuality
  title: string
  bitrate: string
  description: string
}> = [
  {
    id: 'low',
    title: 'Economia',
    bitrate: '96 kbps',
    description: 'Menor consumo de dados. Ideal para redes móveis limitadas.',
  },
  {
    id: 'medium',
    title: 'Média',
    bitrate: '160 kbps',
    description: 'Equilíbrio entre qualidade e uso de dados.',
  },
  {
    id: 'high',
    title: 'Alta',
    bitrate: '320 kbps',
    description: 'Alta fidelidade para a maioria das escutas.',
  },
  {
    id: 'ultra',
    title: 'Ultra',
    bitrate: 'Hi-Fi',
    description: 'Máxima fidelidade quando a conexão permitir.',
  },
]

export const EQ_PRESET_OPTIONS: Array<{ id: EqPreset; label: string }> = [
  { id: 'flat', label: 'Padrão (Flat)' },
  { id: 'bass_boost', label: 'Bass Boost' },
  { id: 'underground', label: 'Underground / Phonk' },
  { id: 'vocal', label: 'Vocal & Letras' },
  { id: 'electronic', label: 'Eletrônica' },
  { id: 'custom', label: 'Personalizado' },
]

export const EQ_PRESET_BANDS: Record<Exclude<EqPreset, 'custom'>, EqBands> = {
  flat: { subBass: 0, bass: 0, mid: 0, presence: 0, treble: 0 },
  bass_boost: { subBass: 6, bass: 5, mid: 0, presence: -1, treble: 0 },
  underground: { subBass: 8, bass: 6, mid: -2, presence: 1, treble: 2 },
  vocal: { subBass: -2, bass: -1, mid: 3, presence: 5, treble: 2 },
  electronic: { subBass: 4, bass: 2, mid: 0, presence: 3, treble: 4 },
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  quality: 'high',
  eqPreset: 'flat',
  eqBands: { ...EQ_PRESET_BANDS.flat },
  bassBoost: false,
  normalizeVolume: true,
  crossfadeSeconds: 0,
  autoplaySimilar: true,
}

/** Extras assimétricos — impacto imediato nos graves. */
const BASS_BOOST_SUB_EXTRA_DB = 4
const BASS_BOOST_BASS_EXTRA_DB = 2.5
const EQ_MIN = -12
const EQ_MAX = 12

function clampDb(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(EQ_MAX, Math.max(EQ_MIN, value))
}

function clampCrossfade(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(12, Math.max(0, Math.round(value)))
}

function isQuality(value: unknown): value is AudioQuality {
  return (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'ultra'
  )
}

function isEqPreset(value: unknown): value is EqPreset {
  return (
    value === 'flat' ||
    value === 'bass_boost' ||
    value === 'underground' ||
    value === 'vocal' ||
    value === 'electronic' ||
    value === 'custom'
  )
}

function sanitizeBands(raw: unknown): EqBands {
  const source =
    raw && typeof raw === 'object' ? (raw as Partial<EqBands>) : {}
  return {
    subBass: clampDb(Number(source.subBass ?? 0)),
    bass: clampDb(Number(source.bass ?? 0)),
    mid: clampDb(Number(source.mid ?? 0)),
    presence: clampDb(Number(source.presence ?? 0)),
    treble: clampDb(Number(source.treble ?? 0)),
  }
}

function sanitizeSettings(raw: unknown): AudioSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AUDIO_SETTINGS, eqBands: { ...DEFAULT_AUDIO_SETTINGS.eqBands } }
  }

  const data = raw as Partial<AudioSettings>
  return {
    quality: isQuality(data.quality) ? data.quality : DEFAULT_AUDIO_SETTINGS.quality,
    eqPreset: isEqPreset(data.eqPreset) ? data.eqPreset : DEFAULT_AUDIO_SETTINGS.eqPreset,
    eqBands: sanitizeBands(data.eqBands),
    bassBoost:
      typeof data.bassBoost === 'boolean'
        ? data.bassBoost
        : DEFAULT_AUDIO_SETTINGS.bassBoost,
    normalizeVolume:
      typeof data.normalizeVolume === 'boolean'
        ? data.normalizeVolume
        : DEFAULT_AUDIO_SETTINGS.normalizeVolume,
    crossfadeSeconds: clampCrossfade(
      Number(data.crossfadeSeconds ?? DEFAULT_AUDIO_SETTINGS.crossfadeSeconds),
    ),
    autoplaySimilar:
      typeof data.autoplaySimilar === 'boolean'
        ? data.autoplaySimilar
        : DEFAULT_AUDIO_SETTINGS.autoplaySimilar,
  }
}

function emitUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUDIO_SETTINGS_UPDATED_EVENT))
}

function persist(settings: AudioSettings): AudioSettings {
  const next = sanitizeSettings(settings)
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
  emitUpdated()
  return next
}

/** Carrega configurações do localStorage (ou padrão). */
export function getAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY)
    if (!raw) {
      return {
        ...DEFAULT_AUDIO_SETTINGS,
        eqBands: { ...DEFAULT_AUDIO_SETTINGS.eqBands },
      }
    }
    return sanitizeSettings(JSON.parse(raw) as unknown)
  } catch {
    return {
      ...DEFAULT_AUDIO_SETTINGS,
      eqBands: { ...DEFAULT_AUDIO_SETTINGS.eqBands },
    }
  }
}

/** Substitui o objeto inteiro e notifica ouvintes. */
export function saveAudioSettings(settings: AudioSettings): AudioSettings {
  return persist(settings)
}

/** Atualiza parcialmente e dispara `azuri-settings-updated`. */
export function updateAudioSettings(
  patch: Partial<AudioSettings>,
): AudioSettings {
  const current = getAudioSettings()
  return persist({
    ...current,
    ...patch,
    eqBands: patch.eqBands
      ? sanitizeBands(patch.eqBands)
      : { ...current.eqBands },
  })
}

export function resetAudioSettings(): AudioSettings {
  return persist({
    ...DEFAULT_AUDIO_SETTINGS,
    eqBands: { ...DEFAULT_AUDIO_SETTINGS.eqBands },
  })
}

export function setAudioQuality(quality: AudioQuality): AudioSettings {
  return updateAudioSettings({ quality })
}

export function setEqPreset(preset: EqPreset): AudioSettings {
  if (preset === 'custom') {
    return updateAudioSettings({ eqPreset: 'custom' })
  }
  return updateAudioSettings({
    eqPreset: preset,
    eqBands: { ...EQ_PRESET_BANDS[preset] },
  })
}

export function setEqBand(
  band: keyof EqBands,
  value: number,
): AudioSettings {
  const current = getAudioSettings()
  return updateAudioSettings({
    eqPreset: 'custom',
    eqBands: {
      ...current.eqBands,
      [band]: clampDb(value),
    },
  })
}

export function setBassBoost(enabled: boolean): AudioSettings {
  return updateAudioSettings({ bassBoost: enabled })
}

export function setNormalizeVolume(enabled: boolean): AudioSettings {
  return updateAudioSettings({ normalizeVolume: enabled })
}

export function setCrossfadeSeconds(seconds: number): AudioSettings {
  return updateAudioSettings({ crossfadeSeconds: clampCrossfade(seconds) })
}

export function setAutoplaySimilar(enabled: boolean): AudioSettings {
  return updateAudioSettings({ autoplaySimilar: enabled })
}

/** Ganhos efetivos enviados aos filtros Biquad (inclui reforço extra de graves). */
export function getEffectiveEqGains(settings: AudioSettings): EqBands {
  const subExtra = settings.bassBoost ? BASS_BOOST_SUB_EXTRA_DB : 0
  const bassExtra = settings.bassBoost ? BASS_BOOST_BASS_EXTRA_DB : 0
  return {
    subBass: clampDb(settings.eqBands.subBass + subExtra),
    bass: clampDb(settings.eqBands.bass + bassExtra),
    mid: clampDb(settings.eqBands.mid),
    presence: clampDb(settings.eqBands.presence),
    treble: clampDb(settings.eqBands.treble),
  }
}

export type StreamProxyParams = {
  query: string
  title?: string
  artist?: string
  /** Duração esperada em segundos (trava de matching no backend). */
  duration?: number
  quality?: AudioQuality
}

/** URL do proxy CORS no backend para Web Audio API. */
export function buildStreamProxyUrl(
  queryOrParams: string | StreamProxyParams,
  quality?: AudioQuality,
): string {
  const params: StreamProxyParams =
    typeof queryOrParams === 'string'
      ? { query: queryOrParams, quality }
      : queryOrParams

  const q = params.quality ?? quality ?? getAudioSettings().quality
  const search = new URLSearchParams()
  search.set('query', params.query.trim())
  if (params.title?.trim()) search.set('title', params.title.trim())
  if (params.artist?.trim()) search.set('artist', params.artist.trim())
  if (params.duration && params.duration > 0) {
    search.set('duration', String(Math.round(params.duration)))
  }
  search.set('quality', q)
  return `http://localhost:3001/api/stream?${search.toString()}`
}

export function isStreamProxyUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\/api\/stream\?/.test(url) && !/resolve=1|format=json/.test(url)
}

export function getQualityBadgeLabel(settings: AudioSettings): string {
  if (settings.bassBoost) return 'BASS+'
  switch (settings.quality) {
    case 'low':
      return 'ECONOMIA'
    case 'medium':
      return 'MÉDIA'
    case 'ultra':
      return 'ULTRA'
    case 'high':
    default:
      return 'ALTA'
  }
}

export function subscribeAudioSettings(
  listener: () => void,
): () => void {
  window.addEventListener(AUDIO_SETTINGS_UPDATED_EVENT, listener)
  return () => {
    window.removeEventListener(AUDIO_SETTINGS_UPDATED_EVENT, listener)
  }
}
