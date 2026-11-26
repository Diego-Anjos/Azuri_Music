import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  EQ_BAND_META,
  EQ_PRESET_OPTIONS,
  QUALITY_OPTIONS,
  getAudioSettings,
  resetAudioSettings,
  setAutoplaySimilar,
  setBassBoost,
  setCrossfadeSeconds,
  setEqBand,
  setEqPreset,
  setNormalizeVolume,
  setAudioQuality,
  subscribeAudioSettings,
  type AudioQuality,
  type AudioSettings,
  type EqBands,
  type EqPreset,
} from '../services/audioSettingsService'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05]"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#F8FAFC]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-[#94A3B8]">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-cyan-400' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

function EqSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
}) {
  const percent = ((value + 12) / 24) * 100

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-[#F8FAFC]">
            {label}{' '}
            <span className="text-[#94A3B8]">· {hint}</span>
          </p>
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-cyan-300">
          {value > 0 ? `+${value}` : value} dB
        </span>
      </div>
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={value}
        aria-label={`${hint} (${label})`}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${percent}%, rgba(255,255,255,0.12) ${percent}%, rgba(255,255,255,0.12) 100%)`,
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.65)]"
      />
    </div>
  )
}

export function Settings() {
  const isEqActive = usePlayerStore((s) => s.isEqActive)
  const [settings, setSettings] = useState<AudioSettings>(() =>
    getAudioSettings(),
  )
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    return subscribeAudioSettings(() => {
      setSettings(getAudioSettings())
      setSavedFlash(true)
    })
  }, [])

  useEffect(() => {
    if (!savedFlash) return
    const timer = window.setTimeout(() => setSavedFlash(false), 1600)
    return () => window.clearTimeout(timer)
  }, [savedFlash])

  function handleQuality(quality: AudioQuality) {
    setSettings(setAudioQuality(quality))
  }

  function handlePreset(preset: EqPreset) {
    setSettings(setEqPreset(preset))
  }

  function handleBand(band: keyof EqBands, value: number) {
    setSettings(setEqBand(band, value))
  }

  function handleReset() {
    setSettings(resetAudioSettings())
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-[#1E293B] via-[#0B0F19] to-[#0B0F19] pb-32">
      <div className="mx-auto max-w-3xl px-4 pt-2 md:px-8 md:pt-4">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[#F8FAFC]">Configurações</h1>
            <p className="mt-2 text-sm text-[#94A3B8]">
              Qualidade, equalizador e experiência de reprodução.
            </p>
          </div>
          <p
            className={`text-xs font-medium tracking-wide text-cyan-400 transition-opacity ${
              savedFlash ? 'opacity-100' : 'opacity-0'
            }`}
            aria-live="polite"
          >
            Salvo automaticamente
          </p>
        </header>

        {/* Bloco 1 — Qualidade */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-[#111827]/70 p-6 backdrop-blur-md">
          <h2 className="text-lg font-semibold text-[#F8FAFC]">
            Qualidade de Áudio
          </h2>
          <p className="mt-1 text-sm text-[#94A3B8]">
            Streaming e reprodução — escolhida ao solicitar streams no backend.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {QUALITY_OPTIONS.map((option) => {
              const active = settings.quality === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleQuality(option.id)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    active
                      ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-[#F8FAFC]">
                      {option.title}
                    </span>
                    <span className="text-xs font-medium text-cyan-300">
                      {option.bitrate}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        {/* Bloco 2 — Equalizador */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-[#111827]/70 p-6 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#F8FAFC]">
                Equalizador & Reforço de Graves
              </h2>
              <p className="mt-1 text-sm text-[#94A3B8]">
                Aplicado em tempo real via Web Audio API quando o stream CORS
                estiver ativo.
              </p>
            </div>
            {isEqActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]"
                  aria-hidden
                />
                Processamento Ativo (Web Audio)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200/90">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-amber-400"
                  aria-hidden
                />
                Modo Externo (Abra ou toque uma faixa via stream direto para
                ativar o EQ)
              </span>
            )}
          </div>

          <div className="mt-5">
            <ToggleSwitch
              checked={settings.bassBoost}
              onChange={(value) => setSettings(setBassBoost(value))}
              label="Reforço de Graves (Bass Boost)"
              description="Soma +4 dB no sub-grave (60Hz) e +2.5 dB no grave (230Hz)."
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {EQ_PRESET_OPTIONS.map((preset) => {
              const active = settings.eqPreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePreset(preset.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300'
                      : 'border-white/10 bg-white/[0.03] text-[#94A3B8] hover:border-white/20 hover:text-[#F8FAFC]'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {EQ_BAND_META.map((band) => (
              <EqSlider
                key={band.key}
                label={band.label}
                hint={band.hint}
                value={settings.eqBands[band.key]}
                onChange={(value) => handleBand(band.key, value)}
              />
            ))}
          </div>
        </section>

        {/* Bloco 3 — Experiência */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-[#111827]/70 p-6 backdrop-blur-md">
          <h2 className="text-lg font-semibold text-[#F8FAFC]">
            Experiência de Reprodução
          </h2>
          <p className="mt-1 text-sm text-[#94A3B8]">
            Controles de continuidade e nivelamento entre faixas.
          </p>

          <div className="mt-5 space-y-3">
            <ToggleSwitch
              checked={settings.normalizeVolume}
              onChange={(value) => setSettings(setNormalizeVolume(value))}
              label="Normalizar volume entre músicas"
              description="Comprime picos e nivela faixas altas e baixas."
            />
            <ToggleSwitch
              checked={settings.autoplaySimilar}
              onChange={(value) => setSettings(setAutoplaySimilar(value))}
              label="Reprodução automática"
              description="Toca faixas semelhantes automaticamente ao fim da fila."
            />
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#F8FAFC]">
                  Transição suave (Crossfade)
                </p>
                <p className="mt-0.5 text-xs text-[#94A3B8]">
                  Fade entre faixas de 0s a 12s.
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-cyan-300">
                {settings.crossfadeSeconds}s
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={settings.crossfadeSeconds}
              aria-label="Crossfade em segundos"
              onChange={(event) =>
                setSettings(setCrossfadeSeconds(Number(event.target.value)))
              }
              style={{
                background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${(settings.crossfadeSeconds / 12) * 100}%, rgba(255,255,255,0.15) ${(settings.crossfadeSeconds / 12) * 100}%, rgba(255,255,255,0.15) 100%)`,
              }}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(34,211,238,0.6)]"
            />
          </div>
        </section>

        <footer className="flex justify-end pb-8">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-[#F8FAFC] transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={ICON_STROKE} />
            Restaurar padrão
          </button>
        </footer>
      </div>
    </div>
  )
}
