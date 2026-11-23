import { Mail, X } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

const ICON_STROKE = 1.5

export type ShareModalProps = {
  open: boolean
  onClose: () => void
  title: string
  artist: string
  coverUrl?: string | null
  shareUrl: string
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function XTwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.227-8.26L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ShareModal({
  open,
  onClose,
  title,
  artist,
  coverUrl,
  shareUrl,
}: ShareModalProps) {
  const [linkCopied, setLinkCopied] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const message = `Confira "${title}" de ${artist} no Azuri Music! ${shareUrl}`
  const encodedText = encodeURIComponent(message)

  useEffect(() => {
    if (!open) {
      setLinkCopied(false)
      setToast(null)
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  if (!open || typeof document === 'undefined') return null

  function stopCardClick(event: MouseEvent) {
    event.stopPropagation()
  }

  async function handleCopyLink(event: MouseEvent) {
    event.stopPropagation()
    const ok = await copyText(shareUrl)
    if (ok) {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }

  async function handleDiscord(event: MouseEvent) {
    event.stopPropagation()
    await copyText(message)
    setToast('Copiado para colar no Discord!')
    window.open('https://discord.com/channels/@me', '_blank', 'noopener,noreferrer')
  }

  async function handleInstagram(event: MouseEvent) {
    event.stopPropagation()
    await copyText(shareUrl)
    setToast('Link copiado para o Instagram!')
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
  }

  function openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const platforms = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      className: 'bg-[#25D366] text-white',
      icon: <WhatsAppIcon className="h-5 w-5" />,
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        openExternal(`https://api.whatsapp.com/send?text=${encodedText}`)
      },
    },
    {
      id: 'x',
      label: 'X',
      className: 'bg-[#1E293B] text-white',
      icon: <XTwitterIcon className="h-5 w-5" />,
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        openExternal(`https://twitter.com/intent/tweet?text=${encodedText}`)
      },
    },
    {
      id: 'facebook',
      label: 'Facebook',
      className: 'bg-[#1877F2] text-white',
      icon: <FacebookIcon className="h-5 w-5" />,
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        openExternal(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
        )
      },
    },
    {
      id: 'discord',
      label: 'Discord',
      className: 'bg-[#5865F2] text-white',
      icon: <DiscordIcon className="h-5 w-5" />,
      onClick: handleDiscord,
    },
    {
      id: 'instagram',
      label: 'Instagram',
      className:
        'bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white',
      icon: <InstagramIcon className="h-5 w-5" />,
      onClick: handleInstagram,
    },
    {
      id: 'email',
      label: 'E-mail',
      className: 'bg-[#475569] text-white',
      icon: <Mail className="h-5 w-5" strokeWidth={ICON_STROKE} />,
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}`
      },
    },
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="azuri-share-title"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl"
        onClick={stopCardClick}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="azuri-share-title" className="text-lg font-bold text-white">
            Compartilhar
          </h2>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <div className="mb-5 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#0B0F19] text-xs text-gray-500">
              —
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{title}</p>
            <p className="truncate text-sm text-gray-400">{artist}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {platforms.map((platform) => (
            <button
              key={platform.id}
              type="button"
              onClick={platform.onClick}
              className="flex flex-col items-center gap-2 text-center transition-transform hover:scale-105"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg ${platform.className}`}
              >
                {platform.icon}
              </span>
              <span className="text-[11px] font-medium text-gray-300">
                {platform.label}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/50 p-2">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="min-w-0 flex-1 truncate bg-transparent px-2 text-sm text-gray-300 outline-none"
            onClick={(event) => {
              event.stopPropagation()
              ;(event.target as HTMLInputElement).select()
            }}
            aria-label="Link para compartilhar"
          />
          <button
            type="button"
            onClick={handleCopyLink}
            className="shrink-0 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-cyan-300"
          >
            {linkCopied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>

        {toast && (
          <p className="mt-3 text-center text-xs font-medium text-cyan-400">
            {toast}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
