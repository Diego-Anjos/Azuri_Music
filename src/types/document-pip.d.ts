/** Document Picture-in-Picture API (Chromium). */
interface DocumentPictureInPictureOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
}

interface DocumentPictureInPicture {
  requestWindow(
    options?: DocumentPictureInPictureOptions,
  ): Promise<Window>
  readonly window: Window | null
  addEventListener(
    type: 'enter',
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener(
    type: 'enter',
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions,
  ): void
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture
}

interface DocumentPictureInPictureEventMap {
  enter: Event
}
