import {
  getFollowingArtists,
  getLikedTracks,
  getPlaylists,
  subscribeLibraryUpdates,
  type FollowingArtist,
  type LikedTrackEntry,
  type UserPlaylist,
} from './libraryStorage'

export const USER_PROFILE_KEY = 'azuri_user_profile'
export const PROFILE_UPDATED_EVENT = 'azuri-profile-updated'

export type AccountIntent = 'listener' | 'creator' | 'curator' | 'both'
export type AccountType = 'listener' | 'artist'

export type UserProfile = {
  userId: string
  name: string
  firstName: string
  lastName: string
  handle: string
  bio: string
  location: string
  avatarUrl: string
  bannerUrl: string
  followersCount: number
  plan: 'Azuri Plus'
  email: string
  birthDate: string
  cpf: string
  favoriteGenres: string[]
  accountIntent: AccountIntent
  accountType: AccountType
  acceptedTerms: boolean
  createdAt: string
  isAuthenticated: boolean
}

export type UserProfileStats = {
  playlistsCount: number
  likedTracksCount: number
  followingCount: number
  followersCount: number
  playlists: UserPlaylist[]
  likedTracks: LikedTrackEntry[]
  following: FollowingArtist[]
}

export type UserProfileUpdate = Partial<
  Pick<
    UserProfile,
    | 'name'
    | 'firstName'
    | 'lastName'
    | 'handle'
    | 'bio'
    | 'location'
    | 'avatarUrl'
    | 'bannerUrl'
    | 'favoriteGenres'
    | 'accountIntent'
    | 'accountType'
  >
>

export type RegisterUserInput = {
  firstName: string
  lastName: string
  handle: string
  email: string
  birthDate: string
  cpf: string
  favoriteGenres: string[]
  accountIntent: AccountIntent
  acceptedTerms: boolean
}

export const MOCK_AUTH_PROFILE = {
  name: '',
  firstName: '',
  lastName: '',
  handle: '',
  email: '',
} as const

const ACCOUNT_INTENT_VALUES: AccountIntent[] = [
  'listener',
  'creator',
  'curator',
  'both',
]

const DEFAULT_PROFILE: UserProfile = {
  userId: '',
  name: '',
  firstName: '',
  lastName: '',
  handle: '',
  bio: '',
  location: '',
  avatarUrl: 'https://picsum.photos/seed/azuri-guest/256/256',
  bannerUrl: 'https://picsum.photos/seed/azuri-banner-cyan/1600/500',
  followersCount: 0,
  plan: 'Azuri Plus',
  email: '',
  birthDate: '',
  cpf: '',
  favoriteGenres: [],
  accountIntent: 'listener',
  accountType: 'listener',
  acceptedTerms: false,
  createdAt: '',
  isAuthenticated: false,
}

const GUEST_AVATAR = DEFAULT_PROFILE.avatarUrl
const GUEST_BANNER = DEFAULT_PROFILE.bannerUrl

export function accountIntentToType(intent: AccountIntent): AccountType {
  return intent === 'creator' || intent === 'both' ? 'artist' : 'listener'
}

export function accountTypeToIntent(type: AccountType | string): AccountIntent {
  return type === 'artist' ? 'creator' : 'listener'
}

export function getAccountIntentLabel(intent: AccountIntent): string {
  switch (intent) {
    case 'creator':
      return 'CRIADOR • AZURI STUDIO'
    case 'both':
      return 'COMPLETO • AZURI STUDIO'
    case 'curator':
      return 'CURADOR • AZURI PLUS'
    case 'listener':
    default:
      return 'OUVINTE • AZURI PLUS'
  }
}

export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length < 11) return cpf || '—'
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

function emitProfileUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
  }
}

function normalizeHandle(handle: string): string {
  const trimmed = handle.trim()
  if (!trimmed) return DEFAULT_PROFILE.handle
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function composeName(firstName: string, lastName: string, fallback = ''): string {
  const full = `${firstName.trim()} ${lastName.trim()}`.trim()
  return full || fallback
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function isAccountIntent(value: unknown): value is AccountIntent {
  return (
    typeof value === 'string' &&
    ACCOUNT_INTENT_VALUES.includes(value as AccountIntent)
  )
}

function isValidProfile(value: unknown): value is Partial<UserProfile> {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<UserProfile>
  return (
    typeof item.name === 'string' &&
    typeof item.handle === 'string' &&
    typeof item.bio === 'string' &&
    typeof item.location === 'string' &&
    typeof item.avatarUrl === 'string' &&
    typeof item.followersCount === 'number' &&
    item.plan === 'Azuri Plus'
  )
}

function normalizeProfile(parsed: Partial<UserProfile>): UserProfile {
  const firstName =
    typeof parsed.firstName === 'string' && parsed.firstName.trim()
      ? parsed.firstName.trim()
      : splitName(parsed.name ?? DEFAULT_PROFILE.name).firstName
  const lastName =
    typeof parsed.lastName === 'string' && parsed.lastName.trim()
      ? parsed.lastName.trim()
      : splitName(parsed.name ?? DEFAULT_PROFILE.name).lastName
  const name =
    composeName(firstName, lastName) ||
    (typeof parsed.name === 'string' ? parsed.name : DEFAULT_PROFILE.name)

  const accountType =
    parsed.accountType === 'artist' || parsed.accountType === 'listener'
      ? parsed.accountType
      : isAccountIntent(parsed.accountIntent)
        ? accountIntentToType(parsed.accountIntent)
        : DEFAULT_PROFILE.accountType

  return {
    ...DEFAULT_PROFILE,
    ...parsed,
    userId: typeof parsed.userId === 'string' ? parsed.userId : DEFAULT_PROFILE.userId,
    firstName,
    lastName,
    name,
    handle: normalizeHandle(parsed.handle ?? DEFAULT_PROFILE.handle),
    email: typeof parsed.email === 'string' ? parsed.email : DEFAULT_PROFILE.email,
    birthDate:
      typeof parsed.birthDate === 'string'
        ? parsed.birthDate
        : DEFAULT_PROFILE.birthDate,
    cpf: typeof parsed.cpf === 'string' ? parsed.cpf : DEFAULT_PROFILE.cpf,
    avatarUrl:
      typeof parsed.avatarUrl === 'string' && parsed.avatarUrl.trim()
        ? parsed.avatarUrl.trim()
        : DEFAULT_PROFILE.avatarUrl,
    bannerUrl:
      typeof parsed.bannerUrl === 'string' && parsed.bannerUrl.trim()
        ? parsed.bannerUrl.trim()
        : DEFAULT_PROFILE.bannerUrl,
    favoriteGenres: Array.isArray(parsed.favoriteGenres)
      ? parsed.favoriteGenres.filter((g): g is string => typeof g === 'string')
      : DEFAULT_PROFILE.favoriteGenres,
    accountIntent: isAccountIntent(parsed.accountIntent)
      ? parsed.accountIntent
      : accountTypeToIntent(accountType),
    accountType,
    acceptedTerms:
      typeof parsed.acceptedTerms === 'boolean'
        ? parsed.acceptedTerms
        : DEFAULT_PROFILE.acceptedTerms,
    createdAt:
      typeof parsed.createdAt === 'string'
        ? parsed.createdAt
        : DEFAULT_PROFILE.createdAt,
    isAuthenticated:
      typeof parsed.isAuthenticated === 'boolean'
        ? parsed.isAuthenticated
        : DEFAULT_PROFILE.isAuthenticated,
    plan: 'Azuri Plus',
  }
}

/** Hidrata o cache local a partir de uma linha remota de profiles. */
export function applyRemoteProfile(input: {
  userId: string
  firstName: string
  lastName: string
  username: string
  email: string
  birthDate?: string
  cpf?: string
  favoriteGenres?: string[]
  accountType?: AccountType | string
  bio?: string
  location?: string
  avatarUrl?: string
  bannerUrl?: string
  acceptedTerms?: boolean
  createdAt?: string
}): UserProfile {
  const accountType: AccountType =
    input.accountType === 'artist' ? 'artist' : 'listener'
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const next: UserProfile = {
    ...DEFAULT_PROFILE,
    userId: input.userId,
    firstName,
    lastName,
    name: composeName(firstName, lastName) || input.email,
    handle: normalizeHandle(input.username),
    email: input.email.trim().toLowerCase(),
    birthDate: input.birthDate ?? '',
    cpf: (input.cpf ?? '').replace(/\D/g, ''),
    favoriteGenres: input.favoriteGenres ?? [],
    accountType,
    accountIntent: accountTypeToIntent(accountType),
    bio: input.bio?.trim() ?? '',
    location: input.location?.trim() ?? '',
    avatarUrl: input.avatarUrl?.trim() || GUEST_AVATAR,
    bannerUrl: input.bannerUrl?.trim() || GUEST_BANNER,
    acceptedTerms: input.acceptedTerms ?? true,
    createdAt: input.createdAt || new Date().toISOString(),
    isAuthenticated: true,
    plan: 'Azuri Plus',
  }
  writeProfile(next)
  return { ...next }
}

export function clearAuthenticatedSession(): UserProfile {
  const next: UserProfile = {
    ...DEFAULT_PROFILE,
    isAuthenticated: false,
  }
  writeProfile(next)
  return { ...next }
}

function readProfileRaw(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!isValidProfile(parsed)) return null
    return normalizeProfile(parsed)
  } catch {
    return null
  }
}

function writeProfile(profile: UserProfile) {
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile))
  emitProfileUpdated()
}

function ensureProfile(): UserProfile {
  const existing = readProfileRaw()
  if (existing) return existing
  writeProfile(DEFAULT_PROFILE)
  return { ...DEFAULT_PROFILE }
}

export function getUserProfile(): UserProfile {
  return { ...ensureProfile() }
}

export function updateUserProfile(patch: UserProfileUpdate): UserProfile {
  const current = ensureProfile()
  const nextFirstName =
    patch.firstName !== undefined
      ? patch.firstName.trim()
      : patch.name !== undefined
        ? splitName(patch.name).firstName
        : current.firstName
  const nextLastName =
    patch.lastName !== undefined
      ? patch.lastName.trim()
      : patch.name !== undefined
        ? splitName(patch.name).lastName
        : current.lastName
  const nextName =
    composeName(nextFirstName, nextLastName) ||
    patch.name?.trim() ||
    current.name

  const next: UserProfile = {
    ...current,
    firstName: nextFirstName,
    lastName: nextLastName,
    name: nextName,
    handle: patch.handle !== undefined ? normalizeHandle(patch.handle) : current.handle,
    bio: patch.bio !== undefined ? patch.bio.trim() : current.bio,
    location:
      patch.location !== undefined ? patch.location.trim() : current.location,
    avatarUrl:
      patch.avatarUrl !== undefined
        ? patch.avatarUrl.trim() || DEFAULT_PROFILE.avatarUrl
        : current.avatarUrl,
    bannerUrl:
      patch.bannerUrl !== undefined
        ? patch.bannerUrl.trim() || DEFAULT_PROFILE.bannerUrl
        : current.bannerUrl,
    favoriteGenres:
      patch.favoriteGenres !== undefined
        ? patch.favoriteGenres
        : current.favoriteGenres,
    accountIntent:
      patch.accountIntent !== undefined
        ? patch.accountIntent
        : current.accountIntent,
    accountType:
      patch.accountType !== undefined
        ? patch.accountType
        : patch.accountIntent !== undefined
          ? accountIntentToType(patch.accountIntent)
          : current.accountType,
    plan: 'Azuri Plus',
  }

  writeProfile(next)
  return { ...next }
}

export function isUserAuthenticated(): boolean {
  const stored = readProfileRaw()
  if (!stored) return false
  return stored.isAuthenticated === true
}

/** Login mock legado — campos vazios não preenchem nome pessoal. */
export function authenticateUser(input?: {
  name?: string
  firstName?: string
  lastName?: string
  handle?: string
  email?: string
  birthDate?: string
  cpf?: string
  favoriteGenres?: string[]
  accountIntent?: AccountIntent
  acceptedTerms?: boolean
}): UserProfile {
  const current = readProfileRaw() ?? { ...DEFAULT_PROFILE }
  const firstName =
    input?.firstName?.trim() ||
    (input?.name ? splitName(input.name).firstName : '') ||
    current.firstName ||
    MOCK_AUTH_PROFILE.firstName
  const lastName =
    input?.lastName?.trim() ||
    (input?.name ? splitName(input.name).lastName : '') ||
    current.lastName ||
    MOCK_AUTH_PROFILE.lastName
  const name =
    composeName(firstName, lastName) ||
    input?.name?.trim() ||
    current.name ||
    MOCK_AUTH_PROFILE.name
  const email =
    input?.email?.trim().toLowerCase() ||
    current.email ||
    MOCK_AUTH_PROFILE.email
  const handleFromEmail = email.includes('@')
    ? `@${email.split('@')[0]}`
    : current.handle || MOCK_AUTH_PROFILE.handle

  const accountIntent = input?.accountIntent ?? current.accountIntent
  const next: UserProfile = {
    ...current,
    userId: current.userId || '',
    firstName,
    lastName,
    name,
    email,
    handle: normalizeHandle(
      input?.handle ||
        (name === MOCK_AUTH_PROFILE.name
          ? MOCK_AUTH_PROFILE.handle
          : handleFromEmail),
    ),
    birthDate:
      input?.birthDate !== undefined ? input.birthDate : current.birthDate,
    cpf: input?.cpf !== undefined ? input.cpf : current.cpf,
    favoriteGenres:
      input?.favoriteGenres !== undefined
        ? input.favoriteGenres
        : current.favoriteGenres,
    accountIntent,
    accountType: accountIntentToType(accountIntent),
    acceptedTerms:
      input?.acceptedTerms !== undefined
        ? input.acceptedTerms
        : current.acceptedTerms,
    createdAt: current.createdAt || new Date().toISOString(),
    isAuthenticated: true,
    plan: 'Azuri Plus',
  }

  writeProfile(next)
  return { ...next }
}

/** @deprecated Prefer AuthContext.register — mantido para compatibilidade. */
export function registerUser(input: RegisterUserInput): UserProfile {
  const current = readProfileRaw() ?? { ...DEFAULT_PROFILE }
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const name = composeName(firstName, lastName)
  const email = input.email.trim().toLowerCase()
  const cpfDigits = input.cpf.replace(/\D/g, '')

  const next: UserProfile = {
    ...current,
    firstName,
    lastName,
    name,
    handle: normalizeHandle(input.handle),
    email,
    birthDate: input.birthDate,
    cpf: cpfDigits,
    favoriteGenres: [...input.favoriteGenres],
    accountIntent: input.accountIntent,
    accountType: accountIntentToType(input.accountIntent),
    acceptedTerms: input.acceptedTerms,
    createdAt: new Date().toISOString(),
    isAuthenticated: true,
    plan: 'Azuri Plus',
  }

  writeProfile(next)
  return { ...next }
}

/** Atalho explícito para o fluxo demo sem banco de dados. */
export function loginMock(input?: {
  name?: string
  email?: string
}): UserProfile {
  return authenticateUser(input)
}

export function signOutUser(): UserProfile {
  return clearAuthenticatedSession()
}

export function getProfileStats(): UserProfileStats {
  const profile = getUserProfile()
  const playlists = getPlaylists()
  const likedTracks = getLikedTracks()
  const following = getFollowingArtists()

  return {
    playlistsCount: playlists.length,
    likedTracksCount: likedTracks.length,
    followingCount: following.length,
    followersCount: profile.followersCount,
    playlists,
    likedTracks,
    following,
  }
}

export function subscribeProfileUpdates(listener: () => void): () => void {
  window.addEventListener(PROFILE_UPDATED_EVENT, listener)
  const unsubscribeLibrary = subscribeLibraryUpdates(listener)
  return () => {
    window.removeEventListener(PROFILE_UPDATED_EVENT, listener)
    unsubscribeLibrary()
  }
}
