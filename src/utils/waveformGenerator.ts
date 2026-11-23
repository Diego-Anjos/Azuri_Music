/**
 * Gera uma assinatura de waveform determinística e estruturada por fase musical.
 * A mesma combinação de id/nome/duração produz sempre o mesmo array.
 */
export function generateTrackWaveform(
  trackId: string,
  trackName: string,
  durationMs: number,
  barCount = 60,
): number[] {
  const count = Math.max(8, Math.floor(barCount))
  const seed = hashSeed(`${trackId}|${trackName}|${Math.floor(durationMs || 0)}`)
  const rand = mulberry32(seed)
  const bars: number[] = []

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1)
    const phase = musicalPhase(t, rand)
    // Micro-variação rítmica por barra (ainda determinística)
    const groove = 0.85 + rand() * 0.3
    const height = clamp(15, 100, phase * groove)
    bars.push(Math.round(height))
  }

  return bars
}

function musicalPhase(t: number, rand: () => number): number {
  // 0–12% Intro: cresce de ~25 a ~45
  if (t < 0.12) {
    const local = t / 0.12
    return lerp(25, 45, local) + (rand() - 0.5) * 10
  }

  // 12–45% Verso + primeiro drop: picos altos intercalados com médios
  if (t < 0.45) {
    const local = (t - 0.12) / 0.33
    const isPeak = rand() > 0.42
    if (isPeak) {
      return lerp(65, 100, 0.35 + local * 0.65) - rand() * 12
    }
    return lerp(40, 70, local) + (rand() - 0.5) * 14
  }

  // 45–60% Ponte / breakdown: queda
  if (t < 0.6) {
    const local = (t - 0.45) / 0.15
    return lerp(45, 20, local) + rand() * 12
  }

  // 60–88% Drop principal / clímax
  if (t < 0.88) {
    const local = (t - 0.6) / 0.28
    const pulse = Math.abs(Math.sin(local * Math.PI * (3 + rand() * 2)))
    const base = lerp(75, 100, pulse)
    return base - rand() * 10
  }

  // 88–100% Outro / fade out
  const local = (t - 0.88) / 0.12
  return lerp(55, 15, local) + rand() * 8
}

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Mistura extra para espalhar IDs parecidos
  h ^= h >>> 13
  h = Math.imul(h, 1274126177)
  h ^= h >>> 16
  return h >>> 0
}

/** PRNG determinístico (Mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t))
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value))
}
