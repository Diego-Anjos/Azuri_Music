/**
 * Guard global anti-race entre trocas rápidas de faixa.
 * Compartilhado entre Zustand (playTrack) e PlayerContext (reset do <audio>).
 */

let playRequestId = 0
let streamAbortController: AbortController | null = null
let registeredAudio: HTMLAudioElement | null = null

/** Registra o <audio> nativo do player para reset síncrono. */
export function registerPlaybackAudioElement(el: HTMLAudioElement | null) {
  registeredAudio = el
}

export function getPlaybackAudioElement(): HTMLAudioElement | null {
  return registeredAudio
}

/** Pausa e limpa o src do áudio nativo (impede overlap ao trocar de faixa). */
export function resetNativeAudioElement(audio?: HTMLAudioElement | null) {
  const el = audio ?? registeredAudio
  if (!el) return
  try {
    el.pause()
    el.removeAttribute('src')
    el.load()
  } catch {
    // ignore
  }
}

export function getPlayRequestId(): number {
  return playRequestId
}

export function isPlayRequestCurrent(requestId: number): boolean {
  return requestId === playRequestId
}

export function getStreamAbortSignal(): AbortSignal | undefined {
  return streamAbortController?.signal
}

/**
 * Inicia uma nova play request: incrementa o id, aborta fetches anteriores
 * e devolve o requestId + signal para a busca de stream/fallback.
 */
export function beginPlayRequest(): {
  requestId: number
  signal: AbortSignal
} {
  if (streamAbortController) {
    try {
      streamAbortController.abort()
    } catch {
      // ignore
    }
  }
  streamAbortController = new AbortController()
  playRequestId += 1
  return {
    requestId: playRequestId,
    signal: streamAbortController.signal,
  }
}
