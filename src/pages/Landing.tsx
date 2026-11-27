import {
  AudioWaveform,
  BadgeCheck,
  Ban,
  Disc3,
  EyeOff,
  HardDrive,
  Headphones,
  Heart,
  History,
  MessageCircle,
  Mic2,
  Music,
  Music2,
  Radio,
  Scale,
  Search as SearchIcon,
  Shield,
  Sparkles,
  Type,
  UploadCloud,
  Users,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AuthModal,
  type AuthMode,
  type InfoModalKey,
} from '../components/AuthModal'
import { useAuth } from '../contexts/AuthContext'

const ICON_STROKE = 1.5

type DevicePreview = 'desktop' | 'mobile'

type FooterModalTopic = {
  icon: LucideIcon
  title: string
  body: string
}

type FooterModalContent = {
  tag: string
  title: string
  intro: string
  topics: FooterModalTopic[]
  cta?: { label: string }
}

const FOOTER_LINKS: { key: InfoModalKey; label: string }[] = [
  { key: 'sobre', label: 'Sobre o Azuri' },
  { key: 'artistas', label: 'Recursos para Artistas' },
  { key: 'diretrizes', label: 'Diretrizes' },
  { key: 'privacidade', label: 'Privacidade' },
  { key: 'termos', label: 'Termos' },
]

const FOOTER_MODAL_CONTENT: Record<InfoModalKey, FooterModalContent> = {
  sobre: {
    tag: 'Identidade • Azuri Music',
    title: 'Sobre o Azuri',
    intro:
      'O Azuri Music nasceu para unir a liberdade da cena underground e independente com uma experiência visual imersiva — onde cada batida ganha forma e cada verso acende no ritmo certo.',
    topics: [
      {
        icon: AudioWaveform,
        title: 'Player com waveforms dinâmicas',
        body: 'Visualize a energia da faixa em tempo real com ondas sonoras que acompanham cada drop, break e clímax.',
      },
      {
        icon: Type,
        title: 'Letras sincronizadas linha a linha',
        body: 'Acompanhe a letra ao vivo, com ajuste fino de timing e Tap Sync para alinhar cada verso ao beat.',
      },
      {
        icon: Mic2,
        title: 'Perfis completos de artistas',
        body: 'Explore biografias, discografias e a identidade visual de produtores e artistas da cena independente.',
      },
    ],
  },
  artistas: {
    tag: 'Azuri Studio • Criadores',
    title: 'Recursos para Artistas',
    intro:
      'O ecossistema Azuri Studio coloca o lançamento nas suas mãos: publique, sincronize letras e conecte-se direto com quem ouve sua arte.',
    topics: [
      {
        icon: Disc3,
        title: 'Singles, EPs e Álbuns',
        body: 'Publique lançamentos completos com metadados claros e organização por projeto.',
      },
      {
        icon: UploadCloud,
        title: 'Capas em alta definição',
        body: 'Envie artes nítidas que brilham no player, nas playlists e nos perfis da plataforma.',
      },
      {
        icon: Type,
        title: 'Letras nativas em destaque',
        body: 'Integre letras que ganham luz linha a linha durante a reprodução — o verso vira parte do show.',
      },
      {
        icon: BadgeCheck,
        title: 'Perfis verificados e comentários',
        body: 'Conecte-se com ouvintes através de perfis verificados e conversas diretas na faixa.',
      },
    ],
    cta: { label: 'Experimentar Upload →' },
  },
  diretrizes: {
    tag: 'Comunidade • Convivência',
    title: 'Diretrizes da Comunidade',
    intro:
      'A cena Azuri cresce quando artistas, produtores e ouvintes se respeitam. Estes são os pilares da nossa convivência.',
    topics: [
      {
        icon: Sparkles,
        title: 'Valorização do independente',
        body: 'Celebramos produtores e artistas da cena underground — crédito, espaço e audiência justa.',
      },
      {
        icon: Users,
        title: 'Crédito transparente em feats',
        body: 'Participações (feat.) devem ser creditadas com clareza: quem fez, quem colaborou, quem merece o reconhecimento.',
      },
      {
        icon: MessageCircle,
        title: 'Comentários construtivos',
        body: 'Feedback que eleva a faixa e o artista. Crítica ok — ataque pessoal, não.',
      },
      {
        icon: Ban,
        title: 'Tolerância zero',
        body: 'Spam, assédio e violação de direitos autorais não têm lugar no Azuri Music.',
      },
    ],
  },
  privacidade: {
    tag: 'Privacidade • Transparência',
    title: 'Política de Privacidade',
    intro:
      'No Azuri Music, seus dados pessoais ficam sob seu controle. Explicamos de forma direta como tudo funciona hoje.',
    topics: [
      {
        icon: HardDrive,
        title: 'Armazenamento local seguro',
        body: 'Playlists, faixas curtidas, histórico e ajustes de sincronização de letras ficam no seu dispositivo via localStorage.',
      },
      {
        icon: Heart,
        title: 'Preferências que são suas',
        body: 'Curtidas, biblioteca e fine-tuning de letras permanecem no navegador — sem conta obrigatória na nuvem.',
      },
      {
        icon: History,
        title: 'Histórico sob seu controle',
        body: 'O que você ouviu recentemente fica localmente, para retomar a sessão sem expor sua rotina.',
      },
      {
        icon: EyeOff,
        title: 'Sem rastreamento invasivo',
        body: 'Consultas anônimas de metadados musicais. Sem venda de dados. Sem vigilância disfarçada de “personalização”.',
      },
    ],
  },
  termos: {
    tag: 'Termos • Uso responsável',
    title: 'Termos de Uso',
    intro:
      'Ao usar o Azuri Music, você concorda com regras simples para ouvintes e criadores — pensadas para proteger a arte e a comunidade.',
    topics: [
      {
        icon: Headphones,
        title: 'Streaming para uso pessoal',
        body: 'O acesso ao catálogo é destinado à escuta pessoal e não comercial dentro da plataforma.',
      },
      {
        icon: Scale,
        title: 'Responsabilidade no Studio',
        body: 'Quem envia faixas e capas no Azuri Studio garante originalidade e direitos sobre o material publicado.',
      },
      {
        icon: Shield,
        title: 'Boas práticas na plataforma',
        body: 'Respeite artistas, créditos e a comunidade. Uso abusivo pode resultar em restrição de acesso.',
      },
    ],
  },
}

export function Landing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()
  const [preview, setPreview] = useState<DevicePreview>('desktop')
  const [searchQuery, setSearchQuery] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [activeInfoModal, setActiveInfoModal] = useState<InfoModalKey | null>(
    null,
  )

  // Deep-link de rota protegida: abre AuthModal na aba de login.
  useEffect(() => {
    const state = location.state as { openAuth?: AuthMode } | null
    if (!state?.openAuth) return
    setAuthMode(state.openAuth === 'signup' ? 'signup' : 'login')
    setAuthOpen(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/home', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  function openAuth(mode: AuthMode) {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  function requireAuth(mode: AuthMode = 'login') {
    openAuth(mode)
  }

  function closeInfoModal() {
    setActiveInfoModal(null)
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    requireAuth('login')
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-[#080B12] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.08),_transparent_55%)]" />

      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#080B12]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <img
                src="/logo.png"
                alt="Azuri Music"
                className="h-10 w-10 object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]"
              />
              <span className="hidden bg-gradient-to-r from-white to-cyan-400 bg-clip-text text-lg font-bold tracking-tight text-transparent sm:inline">
                Azuri Music
              </span>
            </Link>

            <nav className="hidden items-center gap-5 text-sm text-gray-400 lg:flex">
              <button
                type="button"
                onClick={() => scrollTo('catalogo')}
                className="transition-colors hover:text-white"
              >
                Explorar
              </button>
              <button
                type="button"
                onClick={() => scrollTo('letras')}
                className="transition-colors hover:text-white"
              >
                Letras ao Vivo
              </button>
              <button
                type="button"
                onClick={() => scrollTo('estudio')}
                className="transition-colors hover:text-white"
              >
                Para Criadores
              </button>
            </nav>
          </div>

          <form
            onSubmit={handleSearchSubmit}
            className="hidden w-full max-w-md flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm transition-colors focus-within:border-cyan-400/60 md:flex"
          >
            <SearchIcon
              className="h-4 w-4 shrink-0 text-gray-500"
              strokeWidth={ICON_STROKE}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar artistas, faixas ou álbuns..."
              className="w-full bg-transparent text-white outline-none placeholder:text-gray-500"
            />
          </form>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="px-2 py-2 text-sm text-white transition-colors hover:text-cyan-400 sm:px-3"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => openAuth('signup')}
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-[#080B12] transition-all hover:bg-cyan-300 sm:px-5"
            >
              Criar conta
            </button>
            <button
              type="button"
              onClick={() => requireAuth('signup')}
              className="hidden items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-cyan-400 sm:inline-flex"
            >
              <UploadCloud className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              Upload
            </button>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-7xl overflow-x-clip px-6 pb-16 pt-14 sm:pt-20">
          <div className="relative mx-auto mb-6 w-full max-w-4xl">
            <div
              className="pointer-events-none absolute inset-0 select-none"
              aria-hidden
            >
              <Music2
                strokeWidth={ICON_STROKE}
                className="azuri-note-float-a absolute top-4 left-[12%] h-6 w-6 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] sm:left-[18%] sm:h-7 sm:w-7"
                style={{ animationDuration: '5.5s' }}
              />
              <span className="absolute top-1/2 left-[4%] -translate-y-1/2 sm:left-[10%]">
                <AudioWaveform
                  strokeWidth={ICON_STROKE}
                  className="azuri-wave-pulse h-7 w-7 text-sky-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] sm:h-8 sm:w-8"
                  style={{
                    animationDuration: '4.8s',
                    animationDelay: '0.6s',
                  }}
                />
              </span>
              <Headphones
                strokeWidth={ICON_STROKE}
                className="azuri-note-float-b absolute bottom-6 left-[14%] h-5 w-5 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] sm:left-[21%] sm:h-6 sm:w-6"
                style={{
                  animationDuration: '6.4s',
                  animationDelay: '1.2s',
                }}
              />
              <Music
                strokeWidth={ICON_STROKE}
                className="azuri-note-float-b absolute top-12 left-[24%] hidden h-5 w-5 text-cyan-300/80 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] md:block"
                style={{
                  animationDuration: '7s',
                  animationDelay: '0.4s',
                }}
              />
              <Music
                strokeWidth={ICON_STROKE}
                className="azuri-note-float-b absolute top-6 right-[12%] h-6 w-6 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] sm:right-[18%] sm:h-7 sm:w-7"
                style={{
                  animationDuration: '5.8s',
                  animationDelay: '0.3s',
                }}
              />
              <span className="absolute top-1/2 right-[5%] -translate-y-1/2 sm:right-[11%]">
                <Volume2
                  strokeWidth={ICON_STROKE}
                  className="azuri-wave-pulse h-7 w-7 text-sky-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] sm:h-8 sm:w-8"
                  style={{
                    animationDuration: '5.2s',
                    animationDelay: '1s',
                  }}
                />
              </span>
              <Disc3
                strokeWidth={ICON_STROKE}
                className="azuri-note-float-a absolute bottom-6 right-[14%] h-6 w-6 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] sm:right-[20%]"
                style={{
                  animationDuration: '6.8s',
                  animationDelay: '1.5s',
                }}
              />
              <Radio
                strokeWidth={ICON_STROKE}
                className="azuri-note-float-a absolute top-14 right-[24%] hidden h-5 w-5 text-cyan-300/80 drop-shadow-[0_0_12px_rgba(34,211,238,0.75)] md:block"
                style={{
                  animationDuration: '6.2s',
                  animationDelay: '0.8s',
                }}
              />
            </div>

            <div className="relative z-10 flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center">
                <div
                  className="azuri-aura-breath pointer-events-none absolute h-64 w-64 rounded-full bg-radial from-cyan-400/35 via-cyan-500/10 to-transparent blur-3xl sm:h-80 sm:w-80"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute h-44 w-44 animate-[spin_10s_linear_infinite] rounded-full border border-cyan-400/15 border-t-cyan-300/60 sm:h-56 sm:w-56"
                  aria-hidden
                />
                <div className="azuri-float relative z-10">
                  <img
                    src="/logo.png"
                    alt="Azuri Music"
                    className="azuri-led-pulse h-40 w-40 object-contain transition-transform duration-300 hover:scale-105 sm:h-48 sm:w-48 md:h-56 md:w-56"
                  />
                </div>
              </div>
              <p className="mt-3 text-sm font-extrabold uppercase tracking-[0.35em] text-white sm:text-base">
                Azuri{' '}
                <span className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]">
                  Music
                </span>
              </p>
            </div>
          </div>

          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <div className="mb-5 inline-flex max-w-xl items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-cyan-300 sm:text-sm">
              <span aria-hidden>✦</span>
              <span>
                Bem-vindo ao Azuri Music — Onde cada batida ganha vida e cada
                verso acende no seu ritmo.
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
              Sua música. Sem limites. Onde você estiver.
            </h1>
            <p className="mt-4 max-w-xl text-base text-gray-400 sm:text-lg">
              Descubra artistas independentes, acompanhe letras sincronizadas em
              tempo real e publique seus próprios lançamentos.
            </p>
          </div>

          <div className="mt-10 flex items-center justify-center gap-8">
            {(
              [
                { id: 'desktop', label: 'Desktop Web' },
                { id: 'mobile', label: 'Mobile Experience' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreview(tab.id)}
                className={`pb-2 text-sm font-medium transition-colors ${
                  preview === tab.id
                    ? 'border-b-2 border-cyan-400 text-white'
                    : 'border-b-2 border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative mx-auto mt-10 max-w-4xl">
            {preview === 'desktop' ? <DesktopWireframe /> : <MobileHeroWireframe />}
          </div>

          <div className="mt-12 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => openAuth('signup')}
              className="rounded-full bg-cyan-400 px-8 py-3.5 text-base font-bold text-[#080B12] shadow-[0_0_25px_rgba(34,211,238,0.35)] transition-all hover:bg-cyan-300"
            >
              Começar a ouvir agora
            </button>
            <button
              type="button"
              onClick={() => requireAuth('login')}
              className="text-sm text-gray-400 underline-offset-4 transition-colors hover:text-cyan-400 hover:underline"
            >
              Ou explorar sem conta
            </button>
          </div>
        </section>

        <section
          id="catalogo"
          className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:gap-20"
        >
          <FeatureCopy
            title="Mais faixas do momento. Mais da cena underground."
            body="Explore catálogos completos, descubra novos produtores e ouça com visualizador de ondas sonoras em tempo real."
            linkLabel="Explorar catálogo →"
            onLink={() => requireAuth('login')}
          />
          <PhoneShell>
            <CatalogPhoneScreen />
          </PhoneShell>
        </section>

        <section
          id="letras"
          className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:gap-20"
        >
          <div className="order-2 lg:order-1">
            <PhoneShell>
              <LyricsPhoneScreen />
            </PhoneShell>
          </div>
          <div className="order-1 lg:order-2">
            <FeatureCopy
              title="Letras sincronizadas. Sinta cada verso ao vivo."
              body="Acompanhe a letra linha por linha no ritmo exato da batida, com ajuste fino de tempo e modo karaoke imersivo."
              linkLabel="Testar letras ao vivo →"
              onLink={() => requireAuth('login')}
            />
          </div>
        </section>

        <section
          id="estudio"
          className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:gap-20"
        >
          <FeatureCopy
            title="Mais curtidas. Mais playlists. E espaço para sua arte."
            body="Monte suas playlists, siga seus artistas favoritos ou publique seus próprios singles e álbuns no Azuri Studio."
            linkLabel="Acessar Estúdio →"
            onLink={() => requireAuth('signup')}
          />
          <PhoneShell>
            <StudioPhoneScreen />
          </PhoneShell>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Pronto para dar o play? Entre agora e monte sua biblioteca.
          </h2>
          <button
            type="button"
            onClick={() => openAuth('signup')}
            className="mt-8 rounded-full bg-white px-8 py-3 font-bold text-[#080B12] transition-colors hover:bg-cyan-400"
          >
            Criar conta gratuita
          </button>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-10 border-t border-white/10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-6 border-b border-white/5">
          <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-gray-500 md:justify-start">
            {FOOTER_LINKS.map(({ key, label }, index, arr) => (
              <span key={key} className="inline-flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveInfoModal(key)}
                  className="cursor-pointer transition-colors hover:text-cyan-400"
                >
                  {label}
                </button>
                {index < arr.length - 1 && (
                  <span className="text-gray-700" aria-hidden>
                    •
                  </span>
                )}
              </span>
            ))}
          </nav>
          <p className="text-xs text-gray-500">
            Idioma:{' '}
            <span className="font-medium text-cyan-400">Português (Brasil)</span>
          </p>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt=""
              className="w-5 h-5 object-contain opacity-80"
              aria-hidden
            />
            <p>© 2026 Azuri Music. Todos os direitos reservados.</p>
          </div>
          <p className="text-center sm:text-right">
            Plataforma Independente de Streaming &amp; Áudio{' '}
            <span className="text-cyan-400" aria-hidden>
              •
            </span>{' '}
            Brasil
          </p>
        </div>
      </footer>

      <AuthModal
        mode={authMode}
        onModeChange={setAuthMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false)
          navigate('/home')
        }}
        onOpenInfo={(key) => setActiveInfoModal(key)}
        isOpen={authOpen}
      />

      {activeInfoModal && (
        <InfoModal
          modalKey={activeInfoModal}
          onClose={closeInfoModal}
          onStudioCta={() => {
            closeInfoModal()
            requireAuth('signup')
          }}
        />
      )}
    </div>
  )
}

function FeatureCopy({
  title,
  body,
  linkLabel,
  onLink,
}: {
  title: string
  body: string
  linkLabel: string
  onLink: () => void
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 max-w-md text-base leading-relaxed text-gray-400">
        {body}
      </p>
      <button
        type="button"
        onClick={onLink}
        className="mt-6 text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
      >
        {linkLabel}
      </button>
    </div>
  )
}

function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="rounded-[2.2rem] border-[1.5px] border-cyan-400/80 p-3 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
        <div className="overflow-hidden rounded-[1.7rem] border border-cyan-400/30 bg-[#0B0F19]">
          <div className="flex justify-center py-2">
            <div className="h-1.5 w-16 rounded-full bg-cyan-400/40" />
          </div>
          <div className="min-h-[420px] px-3 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

function WaveBars({ bars = 18, className = '' }: { bars?: number; className?: string }) {
  return (
    <div className={`flex h-8 items-end gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="azuri-wave-bar w-[3px] rounded-full bg-cyan-400/80"
          style={{
            height: `${30 + ((i * 37) % 70)}%`,
            animationDelay: `${(i % 8) * 0.12}s`,
          }}
        />
      ))}
    </div>
  )
}

function DesktopWireframe() {
  return (
    <div className="relative mx-auto">
      <div className="overflow-hidden rounded-2xl border border-cyan-400/70 bg-[#0B0F19]/90 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
        <div className="flex items-center gap-2 border-b border-cyan-400/20 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full border border-cyan-400/60" />
          <span className="h-2.5 w-2.5 rounded-full border border-cyan-400/40" />
          <span className="h-2.5 w-2.5 rounded-full border border-cyan-400/30" />
          <div className="ml-4 h-5 flex-1 rounded-md border border-cyan-400/20 bg-cyan-400/5" />
        </div>

        <div className="flex min-h-[280px] sm:min-h-[340px]">
          <aside className="hidden w-36 shrink-0 flex-col gap-3 border-r border-cyan-400/20 p-4 sm:flex">
            {['Home', 'Search', 'Library'].map((item) => (
              <div
                key={item}
                className="h-7 rounded-full border border-cyan-400/25 bg-cyan-400/[0.04] px-3 text-[10px] leading-7 text-cyan-300/70"
              >
                {item}
              </div>
            ))}
            <div className="mt-auto space-y-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-2 rounded-full bg-cyan-400/15"
                  style={{ width: `${50 + n * 12}%` }}
                />
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 rounded-lg border border-cyan-400/50 bg-gradient-to-br from-cyan-400/20 to-transparent sm:h-32 sm:w-32" />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                <div className="h-3 w-24 rounded-full bg-cyan-400/40" />
                <div className="h-5 w-40 max-w-full rounded-full bg-white/80" />
                <div className="h-2.5 w-28 rounded-full bg-cyan-400/25" />
                <WaveBars bars={22} className="mt-2 max-w-[220px]" />
              </div>
            </div>

            <div className="mt-6 space-y-2.5">
              {[88, 72, 95, 60].map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded border border-cyan-400/30 bg-cyan-400/10" />
                  <div
                    className="h-2.5 rounded-full bg-white/20"
                    style={{ width: `${w}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-cyan-400/25 px-4 py-3">
          <div className="h-9 w-9 rounded border border-cyan-400/40 bg-cyan-400/15" />
          <div className="min-w-0 flex-1">
            <div className="h-2.5 w-28 rounded-full bg-white/70" />
            <div className="mt-1.5 h-2 w-16 rounded-full bg-cyan-400/30" />
          </div>
          <WaveBars bars={12} className="hidden h-5 sm:flex" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full border border-cyan-400/50" />
            <div className="h-8 w-8 rounded-full bg-cyan-400/80" />
            <div className="h-6 w-6 rounded-full border border-cyan-400/50" />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -right-2 w-[140px] sm:-right-4 sm:w-[160px]">
        <div className="rounded-[1.6rem] border-[1.5px] border-cyan-400/80 bg-[#080B12] p-2 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
          <div className="overflow-hidden rounded-[1.2rem] border border-cyan-400/25 bg-[#0B0F19] p-2.5">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-cyan-400/40" />
            <div className="mb-2 h-16 rounded-lg border border-cyan-400/40 bg-cyan-400/10" />
            <WaveBars bars={10} className="mb-2 h-5" />
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-white/25" />
              <div className="h-1.5 w-3/4 rounded-full bg-cyan-400/30" />
              <div className="h-1.5 w-1/2 rounded-full bg-white/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MobileHeroWireframe() {
  return (
    <div className="mx-auto flex justify-center py-4">
      <div className="w-full max-w-[300px]">
        <PhoneShell>
          <div className="space-y-3">
            <div className="h-4 w-24 rounded-full bg-cyan-400/40" />
            <div className="h-36 rounded-xl border border-cyan-400/50 bg-gradient-to-br from-cyan-400/20 to-transparent" />
            <WaveBars bars={16} />
            <div className="space-y-2 pt-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-md border border-cyan-400/35 bg-cyan-400/10" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2 rounded-full bg-white/40" style={{ width: `${70 - n * 8}%` }} />
                    <div className="h-1.5 w-1/2 rounded-full bg-cyan-400/25" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PhoneShell>
      </div>
    </div>
  )
}

function CatalogPhoneScreen() {
  const tracks = [
    { title: 'Neon Drift', artist: 'Azuri Lab' },
    { title: 'Midnight Grid', artist: 'Void Pulse' },
    { title: 'Cyan Rain', artist: 'Low Signal' },
    { title: 'Echo Chamber', artist: 'Soft Static' },
  ]

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400/80">
        Em alta
      </p>
      <WaveBars bars={14} className="mb-1" />
      {tracks.map((track) => (
        <div key={track.title} className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-md border border-cyan-400/40 bg-cyan-400/10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{track.title}</p>
            <p className="truncate text-[10px] text-gray-500">{track.artist}</p>
          </div>
          <div className="h-1 w-8 rounded-full bg-cyan-400/30" />
        </div>
      ))}
    </div>
  )
}

function LyricsPhoneScreen() {
  const lines = [
    'Luzes frias no asfalto',
    'O baixo ecoa no peito',
    'Cyan cortando a noite',
    'Sem limites, só o beat',
  ]

  return (
    <div className="flex min-h-[380px] flex-col justify-center gap-5 px-1 text-center">
      {lines.map((line, index) => (
        <p
          key={line}
          className={
            index === 2
              ? 'text-base font-semibold text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.55)]'
              : 'text-sm text-gray-500'
          }
        >
          {line}
        </p>
      ))}
    </div>
  )
}

function StudioPhoneScreen() {
  const tiles = ['Night Drive', 'Synthwave', 'Underground', 'Azuri Mix']

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400/80">
        Sua arte
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((title) => (
          <div key={title} className="space-y-1.5">
            <div className="aspect-square rounded-lg border border-cyan-400/45 bg-gradient-to-br from-cyan-400/20 to-transparent" />
            <p className="truncate text-[10px] text-gray-300">{title}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-8 w-8 rounded-full border border-cyan-400/50 bg-cyan-400/10"
          />
        ))}
      </div>
    </div>
  )
}

function InfoModal({
  modalKey,
  onClose,
  onStudioCta,
}: {
  modalKey: InfoModalKey
  onClose: () => void
  onStudioCta: () => void
}) {
  const titleId = useId()
  const content = FOOTER_MODAL_CONTENT[modalKey]

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-400/30 bg-[#0D1322]/95 p-6 text-left shadow-[0_0_50px_rgba(34,211,238,0.15)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <img
              src="/logo.png"
              alt="Azuri Music"
              className="mt-0.5 h-7 w-7 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                {content.tag}
              </p>
              <h2
                id={titleId}
                className="mt-1 text-2xl font-bold text-white"
              >
                {content.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-gray-400 sm:text-base">
          {content.intro}
        </p>

        <ul className="mt-6 space-y-4">
          {content.topics.map((topic) => {
            const Icon = topic.icon
            return (
              <li
                key={topic.title}
                className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-400">
                  <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">
                    {topic.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-400">
                    {topic.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>

        {content.cta && (
          <button
            type="button"
            onClick={onStudioCta}
            className="mt-6 text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
          >
            {content.cta.label}
          </button>
        )}

        <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center">
          <p className="text-xs text-gray-500">
            Azuri Music • Experiência Sonora Independente
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-cyan-400 px-6 py-2 text-sm font-bold text-[#080B12] transition-colors hover:bg-cyan-300"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
