import {
  Check,
  Eye,
  EyeOff,
  Headphones,
  ListMusic,
  Mic2,
  Sparkles,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import React, {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  checkDatabaseConnection,
  cleanUsername,
  findProfileByUsername,
  getAppwriteErrorMessage,
} from '../lib/appwrite'
import {
  getAccountIntentLabel,
  maskCpf,
  type AccountIntent,
} from '../services/userProfileService'

// ─── Types ───────────────────────────────────────────────────────────────────

type DbConnectionStatus =
  | { state: 'checking' }
  | { state: 'ok'; latencyMs: number }
  | { state: 'error'; latencyMs: number; error: string }

export type AuthMode = 'login' | 'signup'
export type InfoModalKey =
  | 'sobre'
  | 'artistas'
  | 'diretrizes'
  | 'privacidade'
  | 'termos'

// ─── Constants ───────────────────────────────────────────────────────────────

const ICON_STROKE = 1.5

const SIGNUP_GENRES: { label: string; emoji: string }[] = [
  { label: 'Pop', emoji: '🎵' },
  { label: 'Rock', emoji: '🎸' },
  { label: 'Hip-Hop / Rap', emoji: '🎤' },
  { label: 'Trap', emoji: '🔊' },
  { label: 'Funk', emoji: '🎺' },
  { label: 'R&B / Soul', emoji: '🎶' },
  { label: 'Eletrônica', emoji: '⚡' },
  { label: 'House / Techno', emoji: '🎛️' },
  { label: 'Lo-Fi', emoji: '☕' },
  { label: 'Indie', emoji: '🌿' },
  { label: 'MPB', emoji: '🇧🇷' },
  { label: 'Sertanejo', emoji: '🤠' },
  { label: 'Pagode / Samba', emoji: '🥁' },
  { label: 'Reggaeton', emoji: '🌴' },
  { label: 'Jazz', emoji: '🎷' },
  { label: 'Blues', emoji: '🎸' },
  { label: 'Metal', emoji: '🤘' },
  { label: 'K-Pop', emoji: '✨' },
  { label: 'Gospel', emoji: '🙏' },
  { label: 'Clássica', emoji: '🎻' },
  { label: 'Afrobeats', emoji: '🌍' },
  { label: 'Phonk', emoji: '💀' },
]

const ACCOUNT_INTENT_OPTIONS: {
  id: AccountIntent
  title: string
  description: string
  icon: LucideIcon
}[] = [
  {
    id: 'listener',
    title: 'Só ouvir e descobrir',
    description:
      'Explorar faixas, acompanhar letras sincronizadas e montar playlists.',
    icon: Headphones,
  },
  {
    id: 'creator',
    title: 'Publicar minhas músicas',
    description: 'Lançar singles, EPs e álbuns no Azuri Studio.',
    icon: Mic2,
  },
  {
    id: 'both',
    title: 'Ouvir e publicar (Completo)',
    description: 'Experiência completa como ouvinte e artista independente.',
    icon: Sparkles,
  },
  {
    id: 'curator',
    title: 'Curadoria e Playlists',
    description: 'Descobrir talentos underground e organizar coleções.',
    icon: ListMusic,
  },
]

// Label maps for error summaries per step
const STEP1_LABELS: Record<string, string> = {
  firstName: 'Nome real',
  lastName: 'Sobrenome real',
  handle: 'Nome de usuário',
  email: 'E-mail',
  birthDate: 'Data de nascimento',
  cpf: 'CPF',
}
const STEP2_LABELS: Record<string, string> = {
  favoriteGenres: 'Estilos musicais favoritos',
}
const STEP3_LABELS: Record<string, string> = {
  password: 'Senha',
  confirmPassword: 'Confirmar senha',
}
const STEP4_LABELS: Record<string, string> = {
  accountIntent: 'Tipo de conta',
}

// ─── Utility functions ───────────────────────────────────────────────────────

/** Remove chars that aren't letters (inc. accented), spaces, hyphens or apostrophes.
 *  Capitalises first letter of each word. Max 80 chars. */
function formatName(value: string, maxLen = 80): string {
  const cleaned = value.replace(/[^a-zA-ZÀ-ÿ\s'\-]/g, '').slice(0, maxLen)
  return cleaned.replace(/(^|[\s\-'])(.)/g, (_, pre: string, char: string) => pre + char.toUpperCase())
}

/** Keeps @ fixed at start, lowercase, only [a-z0-9._], max 30 chars. */
function formatHandleInput(value: string): string {
  const withoutAt = value.replace(/^@/, '')
  const cleaned = withoutAt
    .replace(/[^a-zA-Z0-9._]/g, '')
    .toLowerCase()
    .slice(0, 30)
  if (!cleaned) return ''
  return `@${cleaned}`
}

/** Auto-formats CPF as 000.000.000-00. */
function formatCpfMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Validates CPF check digits (Módulo 11). */
function validateCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += +d[i] * (10 - i)
  let r = (sum * 10) % 11
  if (r >= 10) r = 0
  if (r !== +d[9]) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += +d[i] * (11 - i)
  r = (sum * 10) % 11
  if (r >= 10) r = 0
  return r === +d[10]
}

/** Returns a password strength score (0-4), label, and colour class. */
function getPasswordStrength(pwd: string): {
  score: number
  label: string
  colorClass: string
  textClass: string
} {
  if (!pwd) return { score: 0, label: '', colorClass: '', textClass: '' }
  let s = 0
  if (pwd.length >= 8) s++
  if (pwd.length >= 12) s++
  if (/[A-Z]/.test(pwd)) s++
  if (/[0-9]/.test(pwd)) s++
  if (/[^A-Za-z0-9]/.test(pwd)) s++
  if (s <= 1)
    return { score: 1, label: 'Fraca', colorClass: 'bg-rose-500', textClass: 'text-rose-400' }
  if (s === 2)
    return { score: 2, label: 'Razoável', colorClass: 'bg-orange-400', textClass: 'text-orange-400' }
  if (s === 3)
    return { score: 3, label: 'Boa', colorClass: 'bg-yellow-400', textClass: 'text-yellow-400' }
  return { score: 4, label: 'Forte', colorClass: 'bg-cyan-400', textClass: 'text-cyan-400' }
}

// ─── Shared sub-components (defined outside AuthModal to avoid re-creation) ──

/** Renders a label span with a required asterisk. */
function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 flex items-center gap-0.5 text-xs font-medium text-gray-400">
      {children}
      <span className="ml-0.5 text-rose-400" aria-hidden="true">*</span>
    </span>
  )
}

/** Renders per-field error message. */
function FieldError({
  field,
  errors,
}: {
  field: string
  errors: Record<string, string>
}) {
  if (!errors[field]) return null
  return (
    <p className="mt-1 text-xs text-rose-400" role="alert">
      {errors[field]}
    </p>
  )
}

/** Renders a summary banner above the step button listing all missing fields. */
function SummaryError({
  fieldErrors,
  labels,
}: {
  fieldErrors: Record<string, string>
  labels: Record<string, string>
}) {
  const names = Object.keys(fieldErrors)
    .filter((k) => k in labels)
    .map((k) => labels[k])
  if (!names.length) return null
  return (
    <div
      className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3.5 py-2.5 text-xs leading-relaxed text-rose-400"
      role="alert"
    >
      Preencha os campos obrigatórios:{' '}
      <span className="font-semibold">{names.join(', ')}</span>
    </div>
  )
}

// ─── Base input class ─────────────────────────────────────────────────────────

const INPUT_BASE =
  'w-full rounded-lg bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-cyan-400/60'

function inputCls(field: string, fieldErrors: Record<string, string>): string {
  const hasError = !!fieldErrors[field]
  return `${INPUT_BASE} border ${
    hasError
      ? 'border-rose-500/80 ring-1 ring-rose-500/40'
      : 'border-white/10'
  }`
}

// ─── AuthModal ────────────────────────────────────────────────────────────────

export function AuthModal({
  mode,
  onModeChange,
  onClose,
  onSuccess,
  onOpenInfo,
  isOpen = true,
}: {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onSuccess: () => void
  onOpenInfo: (key: InfoModalKey) => void
  isOpen?: boolean
}) {
  const titleId = useId()
  const { login, register } = useAuth()
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  // ── Login state ──────────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // ── Signup state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState(1)

  // Step 1 — Personal info
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [handle, setHandle] = useState('')
  const [email, setEmail] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [cpf, setCpf] = useState('')

  // Step 2 — Genres
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([])

  // Step 3 — Passwords
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Step 4 — Account intent + profile
  const [accountIntent, setAccountIntent] = useState<AccountIntent | null>(null)
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  // ── Error / loading state ────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [stepError, setStepError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus>({
    state: 'checking',
  })

  // Max birth date = 13 years ago (computed at render; stable within session)
  const maxBirthDate = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 13)
    return d.toISOString().split('T')[0]
  })()

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setDbStatus({ state: 'checking' })
    void checkDatabaseConnection().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setDbStatus({ state: 'ok', latencyMs: result.latencyMs })
      } else {
        setDbStatus({
          state: 'error',
          latencyMs: result.latencyMs,
          error: result.error || 'Falha desconhecida',
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  useEffect(() => {
    setStepError('')
    setFieldErrors({})
    if (mode === 'login') setStep(1)
  }, [mode])

  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  if (!isOpen) return null

  // ── Helpers ───────────────────────────────────────────────────────────────

  function clearError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function resetStepErrors() {
    setFieldErrors({})
    setStepError('')
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async function handleLoginSubmit(event: FormEvent) {
    event.preventDefault()
    if (!loginEmail.trim() || !loginPassword) {
      setStepError('Informe e-mail e senha.')
      return
    }
    setSubmitting(true)
    setStepError('')
    try {
      await login(loginEmail, loginPassword)
      onSuccess()
    } catch (error) {
      setStepError(getAppwriteErrorMessage(error, 'E-mail ou senha inválidos'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Genre toggle ──────────────────────────────────────────────────────────

  function toggleGenre(genre: string) {
    setFavoriteGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    )
    clearError('favoriteGenres')
  }

  // ── Step 1 validation & navigation ───────────────────────────────────────

  function buildStep1Errors(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!firstName.trim()) errors.firstName = 'Informe seu primeiro nome'
    if (!lastName.trim()) errors.lastName = 'Informe seu sobrenome'
    const usernameClean = handle.replace(/^@/, '').trim()
    if (!usernameClean) {
      errors.handle = 'Informe seu nome de usuário'
    } else if (usernameClean.length < 3) {
      errors.handle = 'O @username precisa ter pelo menos 3 caracteres'
    }
    if (!email.trim()) {
      errors.email = 'Informe seu e-mail'
    } else if (!isValidEmail(email)) {
      errors.email = 'E-mail inválido (usuario@dominio.com)'
    }
    if (!birthDate) {
      errors.birthDate = 'Informe sua data de nascimento'
    } else {
      const birth = new Date(birthDate)
      const today = new Date()
      const age =
        today.getFullYear() -
        birth.getFullYear() -
        (today <
        new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
          ? 1
          : 0)
      if (birth.getFullYear() < 1920 || isNaN(age))
        errors.birthDate = 'Data de nascimento inválida'
      else if (age < 13)
        errors.birthDate = 'Você precisa ter pelo menos 13 anos'
    }
    const cpfDigits = cpf.replace(/\D/g, '')
    if (!cpfDigits) {
      errors.cpf = 'Informe seu CPF'
    } else if (cpfDigits.length !== 11 || !validateCpf(cpf)) {
      errors.cpf = 'CPF inválido'
    }
    return errors
  }

  async function goNextFromStep1() {
    const errors = buildStep1Errors()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    const username = cleanUsername(handle)
    if (username.length < 3) {
      setFieldErrors({ handle: 'O @username precisa ter pelo menos 3 caracteres' })
      return
    }
    setCheckingUsername(true)
    resetStepErrors()
    try {
      const existing = await findProfileByUsername(username)
      if (existing) {
        setFieldErrors({ handle: 'Este @username já está em uso. Escolha outro.' })
        return
      }
      setStep(2)
    } catch (error) {
      setStepError(
        getAppwriteErrorMessage(
          error,
          'Não foi possível verificar o @username. Tente novamente.',
        ),
      )
    } finally {
      setCheckingUsername(false)
    }
  }

  // ── Step 2 validation & navigation ───────────────────────────────────────

  function goNextFromStep2() {
    if (favoriteGenres.length < 1) {
      setFieldErrors({ favoriteGenres: 'Selecione pelo menos 1 gênero musical' })
      return
    }
    resetStepErrors()
    setStep(3)
  }

  // ── Step 3 validation & navigation ───────────────────────────────────────

  function goNextFromStep3() {
    const errors: Record<string, string> = {}
    if (!password) {
      errors.password = 'Informe uma senha'
    } else if (password.length < 8) {
      errors.password = 'A senha precisa ter pelo menos 8 caracteres'
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Confirme sua senha'
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'As senhas não coincidem'
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    resetStepErrors()
    setStep(4)
  }

  // ── Avatar ────────────────────────────────────────────────────────────────

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  // ── Final submit ──────────────────────────────────────────────────────────

  async function handleRegisterSubmit(event: FormEvent) {
    event.preventDefault()
    if (!acceptedTerms || !accountIntent) {
      if (!accountIntent) {
        setFieldErrors({ accountIntent: 'Selecione o tipo de conta' })
      }
      return
    }
    // Safety checks (should already be valid)
    if (password.length < 8 || password !== confirmPassword) {
      setStepError('Verifique sua senha antes de continuar.')
      setStep(3)
      return
    }

    setSubmitting(true)
    resetStepErrors()
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        handle,
        email: email.trim(),
        password,
        birthDate,
        cpf,
        favoriteGenres,
        accountIntent,
        bio,
        location,
        avatarFile,
      })
      onSuccess()
    } catch (error) {
      setStepError(
        getAppwriteErrorMessage(
          error,
          'Não foi possível criar sua conta Azuri. Tente novamente.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const progressPct = (step / 4) * 100
  const isSignup = mode === 'signup'
  const busy = submitting || checkingUsername
  const pwdStrength = getPasswordStrength(password)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#111827]/80 p-6 shadow-2xl backdrop-blur-xl ${
          isSignup ? 'max-w-xl' : 'max-w-md'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center">
              <img
                src="/logo.png"
                alt="Azuri Music"
                className="h-full w-full scale-[1.45] object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]"
              />
            </div>
            <div>
              <h2 id={titleId} className="text-xl font-bold text-white">
                {mode === 'login' ? 'Entrar' : 'Criar conta'}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {mode === 'login'
                  ? 'Entre com sua conta Azuri.'
                  : 'Crie sua conta Azuri em 4 etapas.'}
              </p>
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

        {/* ── Mode tabs ── */}
        <div className="mb-5 flex gap-2 rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => onModeChange('login')}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-cyan-400 text-[#080B12]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => onModeChange('signup')}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'signup'
                ? 'bg-cyan-400 text-[#080B12]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Criar conta
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            LOGIN FORM
        ════════════════════════════════════════════════════════════════ */}
        {mode === 'login' ? (
          <form
            onSubmit={(e) => void handleLoginSubmit(e)}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-400">
                E-mail
              </span>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="email"
                className={`${INPUT_BASE} border border-white/10`}
                placeholder="voce@email.com"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-400">
                Senha
              </span>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                className={`${INPUT_BASE} border border-white/10`}
                placeholder="••••••••"
              />
            </label>

            {stepError && (
              <p className="text-xs text-rose-400">{stepError}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-cyan-400 py-3 text-sm font-bold text-[#080B12] transition-colors hover:bg-cyan-300 disabled:opacity-50"
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        ) : (
          /* ══════════════════════════════════════════════════════════════
              SIGNUP FORM
          ══════════════════════════════════════════════════════════════ */
          <form
            onSubmit={(e) => void handleRegisterSubmit(e)}
            className="space-y-5"
          >
            {/* Progress bar */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-300/90">
                  Etapa {step} de 4
                </p>
                <p className="text-xs text-gray-500">
                  {Math.round(progressPct)}%
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* ──────────────────────────────────────────────────────────
                STEP 1 — Dados da Conta e Identidade
            ────────────────────────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-3.5">
                <p className="text-sm font-semibold text-white">
                  Dados da Conta e Identidade
                </p>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {/* Nome real */}
                  <div>
                    <label className="block">
                      <RequiredLabel>Nome real</RequiredLabel>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(formatName(e.target.value))
                          clearError('firstName')
                        }}
                        autoComplete="given-name"
                        className={inputCls('firstName', fieldErrors)}
                        placeholder="Seu primeiro nome"
                        maxLength={80}
                      />
                    </label>
                    <FieldError field="firstName" errors={fieldErrors} />
                  </div>

                  {/* Sobrenome real */}
                  <div>
                    <label className="block">
                      <RequiredLabel>Sobrenome real</RequiredLabel>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => {
                          setLastName(formatName(e.target.value))
                          clearError('lastName')
                        }}
                        autoComplete="family-name"
                        className={inputCls('lastName', fieldErrors)}
                        placeholder="Seu sobrenome"
                        maxLength={80}
                      />
                    </label>
                    <FieldError field="lastName" errors={fieldErrors} />
                  </div>

                  {/* Nome de usuário */}
                  <div className="sm:col-span-2">
                    <label className="block">
                      <RequiredLabel>Nome de usuário</RequiredLabel>
                      <input
                        type="text"
                        value={handle}
                        onChange={(e) => {
                          setHandle(formatHandleInput(e.target.value))
                          clearError('handle')
                        }}
                        autoComplete="username"
                        className={inputCls('handle', fieldErrors)}
                        placeholder="@username"
                      />
                    </label>
                    <p className="mt-1 text-[11px] text-gray-600">
                      Apenas letras, números,{' '}
                      <span className="font-mono">.</span> e{' '}
                      <span className="font-mono">_</span> · máx. 30 caracteres
                    </p>
                    <FieldError field="handle" errors={fieldErrors} />
                  </div>

                  {/* E-mail */}
                  <div className="sm:col-span-2">
                    <label className="block">
                      <RequiredLabel>E-mail</RequiredLabel>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(
                            e.target.value.replace(/\s/g, '').toLowerCase(),
                          )
                          clearError('email')
                        }}
                        autoComplete="email"
                        className={inputCls('email', fieldErrors)}
                        placeholder="voce@email.com"
                      />
                    </label>
                    <FieldError field="email" errors={fieldErrors} />
                  </div>

                  {/* Data de nascimento */}
                  <div>
                    <label className="block">
                      <RequiredLabel>Data de nascimento</RequiredLabel>
                      <input
                        type="date"
                        value={birthDate}
                        min="1920-01-01"
                        max={maxBirthDate}
                        onChange={(e) => {
                          setBirthDate(e.target.value)
                          clearError('birthDate')
                        }}
                        className={`${inputCls('birthDate', fieldErrors)} [color-scheme:dark]`}
                      />
                    </label>
                    <FieldError field="birthDate" errors={fieldErrors} />
                  </div>

                  {/* CPF */}
                  <div>
                    <label className="block">
                      <RequiredLabel>CPF</RequiredLabel>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cpf}
                        onChange={(e) => {
                          setCpf(formatCpfMask(e.target.value))
                          clearError('cpf')
                        }}
                        className={inputCls('cpf', fieldErrors)}
                        placeholder="000.000.000-00"
                        maxLength={14}
                      />
                    </label>
                    <FieldError field="cpf" errors={fieldErrors} />
                  </div>
                </div>

                <SummaryError fieldErrors={fieldErrors} labels={STEP1_LABELS} />
                {stepError && (
                  <p className="text-xs text-rose-400">{stepError}</p>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void goNextFromStep1()}
                  className="w-full rounded-full bg-cyan-400 py-3 text-sm font-bold text-[#080B12] transition-colors hover:bg-cyan-300 disabled:opacity-50"
                >
                  {checkingUsername
                    ? 'Verificando username…'
                    : 'Próximo: Estilo Musical →'}
                </button>
              </div>
            )}

            {/* ──────────────────────────────────────────────────────────
                STEP 2 — Gêneros Musicais
            ────────────────────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-semibold text-white">
                    Quais sons definem você?
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    Escolha pelo menos{' '}
                    <span className="font-medium text-white">1 gênero</span>.{' '}
                    <span className="text-cyan-400/80">
                      Sugestão: até 5 favoritos.
                    </span>
                  </p>
                </div>

                {/* Genre chips */}
                <div
                  className={`flex flex-wrap gap-2 rounded-xl p-2 transition-colors ${
                    fieldErrors.favoriteGenres
                      ? 'border border-rose-500/40 bg-rose-500/5'
                      : ''
                  }`}
                >
                  {SIGNUP_GENRES.map(({ label, emoji }) => {
                    const selected = favoriteGenres.includes(label)
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleGenre(label)}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all ${
                          selected
                            ? 'border-cyan-400 bg-cyan-400/15 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                            : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        <span aria-hidden="true">{emoji}</span>
                        {label}
                      </button>
                    )
                  })}
                </div>

                {/* Selected count */}
                <p className="text-xs text-gray-500">
                  {favoriteGenres.length === 0
                    ? 'Nenhum gênero selecionado'
                    : `${favoriteGenres.length} gênero${favoriteGenres.length > 1 ? 's' : ''} selecionado${favoriteGenres.length > 1 ? 's' : ''}`}
                </p>

                <SummaryError fieldErrors={fieldErrors} labels={STEP2_LABELS} />
                {fieldErrors.favoriteGenres && (
                  <p className="text-xs text-rose-400">
                    {fieldErrors.favoriteGenres}
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      resetStepErrors()
                      setStep(1)
                    }}
                    className="rounded-full border border-white/15 px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:border-white/30 hover:text-white sm:w-auto"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={goNextFromStep2}
                    className="flex-1 rounded-full bg-cyan-400 py-3 text-sm font-bold text-[#080B12] transition-colors hover:bg-cyan-300"
                  >
                    Próximo: Senha →
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────────────────────────────────────────
                STEP 3 — Segurança (Senha)
            ────────────────────────────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-semibold text-white">
                    Segurança da Conta
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    Crie uma senha forte para proteger sua conta.
                  </p>
                </div>

                <div className="space-y-3.5">
                  {/* Senha */}
                  <div>
                    <label className="block">
                      <RequiredLabel>Senha</RequiredLabel>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                            clearError('password')
                          }}
                          autoComplete="new-password"
                          className={`${inputCls('password', fieldErrors)} pr-10`}
                          placeholder="Mínimo 8 caracteres"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={
                            showPassword ? 'Ocultar senha' : 'Mostrar senha'
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
                        >
                          {showPassword ? (
                            <EyeOff
                              className="h-4 w-4"
                              strokeWidth={ICON_STROKE}
                            />
                          ) : (
                            <Eye
                              className="h-4 w-4"
                              strokeWidth={ICON_STROKE}
                            />
                          )}
                        </button>
                      </div>
                    </label>
                    <FieldError field="password" errors={fieldErrors} />

                    {/* Strength bar */}
                    {password && (
                      <div className="mt-2.5">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                i <= pwdStrength.score
                                  ? pwdStrength.colorClass
                                  : 'bg-white/10'
                              }`}
                            />
                          ))}
                        </div>
                        {pwdStrength.label && (
                          <p
                            className={`mt-1 text-xs ${pwdStrength.textClass}`}
                          >
                            Força: {pwdStrength.label}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confirmar senha */}
                  <div>
                    <label className="block">
                      <RequiredLabel>Confirmar senha</RequiredLabel>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value)
                            clearError('confirmPassword')
                          }}
                          autoComplete="new-password"
                          className={`${inputCls('confirmPassword', fieldErrors)} pr-10`}
                          placeholder="Repita a senha"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          aria-label={
                            showConfirmPassword
                              ? 'Ocultar confirmação'
                              : 'Mostrar confirmação'
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
                        >
                          {showConfirmPassword ? (
                            <EyeOff
                              className="h-4 w-4"
                              strokeWidth={ICON_STROKE}
                            />
                          ) : (
                            <Eye
                              className="h-4 w-4"
                              strokeWidth={ICON_STROKE}
                            />
                          )}
                        </button>
                      </div>
                    </label>
                    <FieldError field="confirmPassword" errors={fieldErrors} />
                  </div>
                </div>

                <SummaryError fieldErrors={fieldErrors} labels={STEP3_LABELS} />
                {stepError && (
                  <p className="text-xs text-rose-400">{stepError}</p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      resetStepErrors()
                      setStep(2)
                    }}
                    className="rounded-full border border-white/15 px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:border-white/30 hover:text-white sm:w-auto"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={goNextFromStep3}
                    className="flex-1 rounded-full bg-cyan-400 py-3 text-sm font-bold text-[#080B12] transition-colors hover:bg-cyan-300"
                  >
                    Próximo: Finalizar →
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────────────────────────────────────────
                STEP 4 — Tipo de conta + Perfil + Termos
            ────────────────────────────────────────────────────────── */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-base font-semibold text-white">
                  Finalização e Perfil
                </p>

                {/* Account summary card */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400">
                    Resumo da Conta
                  </p>
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Nome completo</dt>
                      <dd className="text-right font-medium text-white">
                        {`${firstName.trim()} ${lastName.trim()}`.trim() || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Usuário</dt>
                      <dd className="text-right font-medium text-cyan-300">
                        {handle || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">E-mail</dt>
                      <dd className="truncate text-right font-medium text-white">
                        {email || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">CPF</dt>
                      <dd className="text-right font-medium text-white">
                        {maskCpf(cpf)}
                      </dd>
                    </div>
                    {accountIntent && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Objetivo</dt>
                        <dd className="text-right text-xs font-semibold uppercase tracking-wide text-cyan-300">
                          {getAccountIntentLabel(accountIntent)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {favoriteGenres.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                      {favoriteGenres.map((genre) => (
                        <span
                          key={genre}
                          className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-medium text-cyan-300"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Account intent */}
                <div>
                  <p
                    className={`mb-2 flex items-center gap-0.5 text-xs font-medium ${
                      fieldErrors.accountIntent
                        ? 'text-rose-400'
                        : 'text-gray-400'
                    }`}
                  >
                    Como você quer usar o Azuri?
                    <span className="ml-0.5 text-rose-400" aria-hidden="true">
                      *
                    </span>
                  </p>
                  <div
                    className={`grid grid-cols-1 gap-3 rounded-xl transition-colors ${
                      fieldErrors.accountIntent
                        ? 'border border-rose-500/40 bg-rose-500/5 p-2'
                        : ''
                    }`}
                  >
                    {ACCOUNT_INTENT_OPTIONS.map((option) => {
                      const Icon = option.icon
                      const selected = accountIntent === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setAccountIntent(option.id)
                            clearError('accountIntent')
                          }}
                          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                            selected
                              ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                              : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                              selected
                                ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
                                : 'border-white/10 bg-white/5 text-gray-400'
                            }`}
                          >
                            <Icon
                              className="h-5 w-5"
                              strokeWidth={ICON_STROKE}
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-white">
                              {option.title}
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-gray-400">
                              {option.description}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <FieldError field="accountIntent" errors={fieldErrors} />
                </div>

                {/* Bio + Location */}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-400">
                        <span>
                          Bio{' '}
                          <span className="font-normal text-gray-600">
                            (opcional)
                          </span>
                        </span>
                        <span
                          className={`tabular-nums ${
                            bio.length >= 180
                              ? 'text-orange-400'
                              : 'text-gray-600'
                          }`}
                        >
                          {bio.length}/200
                        </span>
                      </span>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, 200))}
                        rows={2}
                        className={`${INPUT_BASE} border border-white/10 resize-none`}
                        placeholder="Conte um pouco sobre seu gosto musical"
                      />
                    </label>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-gray-400">
                        Localização{' '}
                        <span className="font-normal text-gray-600">
                          (opcional)
                        </span>
                      </span>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) =>
                          setLocation(e.target.value.slice(0, 100))
                        }
                        className={`${INPUT_BASE} border border-white/10`}
                        placeholder="Cidade, UF"
                        maxLength={100}
                      />
                    </label>
                  </div>
                </div>

                {/* Avatar */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/5">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-500">
                          Foto
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">
                        Foto de perfil (opcional)
                      </p>
                      <p className="text-xs text-gray-500">
                        Enviada para o seu perfil Azuri.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
                    >
                      <Upload
                        className="h-3.5 w-3.5"
                        strokeWidth={ICON_STROKE}
                      />
                      Escolher
                    </button>
                  </div>
                </div>

                {/* Terms */}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/20 bg-white/5 transition-colors peer-checked:border-cyan-400 peer-checked:bg-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/50">
                      {acceptedTerms && (
                        <Check
                          className="h-3.5 w-3.5 text-[#080B12]"
                          strokeWidth={3}
                        />
                      )}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-gray-400">
                    Li e concordo com os{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        onOpenInfo('termos')
                      }}
                      className="font-medium text-cyan-400 underline-offset-2 hover:underline"
                    >
                      Termos e Condições de Uso
                    </button>{' '}
                    e com a{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        onOpenInfo('privacidade')
                      }}
                      className="font-medium text-cyan-400 underline-offset-2 hover:underline"
                    >
                      Política de Privacidade
                    </button>{' '}
                    do Azuri Music.
                  </span>
                </label>

                <SummaryError fieldErrors={fieldErrors} labels={STEP4_LABELS} />
                {stepError && (
                  <p className="text-xs text-rose-400">{stepError}</p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      resetStepErrors()
                      setStep(3)
                    }}
                    className="rounded-full border border-white/15 px-4 py-3.5 text-sm font-medium text-gray-300 transition-colors hover:border-white/30 hover:text-white sm:w-auto"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={!acceptedTerms || busy}
                    className="w-full flex-1 rounded-full bg-cyan-400 py-3.5 text-sm font-bold text-[#080B12] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-400"
                  >
                    {submitting ? 'Criando conta…' : 'Finalizar cadastro e entrar'}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ── DB status indicator ── */}
        <div className="mt-5 border-t border-white/10 pt-4">
          {dbStatus.state === 'checking' && (
            <p className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-500" />
              Sincronizando Núcleo Azuri...
            </p>
          )}
          {dbStatus.state === 'ok' && (
            <p className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              Núcleo Azuri conectado ({dbStatus.latencyMs}ms)
            </p>
          )}
          {dbStatus.state === 'error' && (
            <p className="flex items-start gap-2 text-[11px] leading-snug text-rose-400">
              <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-rose-500" />
              <span>
                Núcleo Azuri instável no momento. Tente novamente em instantes.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
