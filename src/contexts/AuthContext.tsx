import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { Models } from 'appwrite'
import {
  account,
  APPWRITE_DATABASE_ID,
  APPWRITE_PROFILES_TABLE_ID,
  cleanUsername,
  findProfileByUserId,
  ID,
  Permission,
  Role,
  tablesDB,
  uploadProfileImage,
  type AppwriteAccountType,
  type ProfileRow,
} from '../lib/appwrite'
import {
  accountIntentToType,
  applyRemoteProfile,
  clearAuthenticatedSession,
  getUserProfile,
  updateUserProfile,
  type AccountIntent,
  type UserProfile,
  type UserProfileUpdate,
} from '../services/userProfileService'
import { usePlayerStore } from '../store/usePlayerStore'

export type RegisterAccountInput = {
  firstName: string
  lastName: string
  handle: string
  email: string
  password: string
  birthDate: string
  cpf: string
  favoriteGenres: string[]
  accountIntent: AccountIntent
  bio?: string
  location?: string
  avatarFile?: File | null
  bannerFile?: File | null
}

export type UpdateProfileInput = UserProfileUpdate & {
  avatarFile?: File | null
  bannerFile?: File | null
}

type AuthContextValue = {
  user: Models.User<Models.Preferences> | null
  profile: UserProfile
  /** true só com sessão válida + perfil remoto carregado. */
  isAuthenticated: boolean
  isLoading: boolean
  /** Alias explícito do boot de autenticação. */
  isLoadingAuth: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (input: RegisterAccountInput) => Promise<void>
  updateProfile: (input: UpdateProfileInput) => Promise<UserProfile>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const PROFILE_MISSING_ERROR =
  'Não encontramos seu perfil Azuri. Complete o cadastro ou contate o suporte.'

function mapRowToLocal(row: ProfileRow, fallbackEmail = ''): UserProfile {
  return applyRemoteProfile({
    userId: row.user_id || row.$id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    username: row.username ?? '',
    email: row.email || fallbackEmail,
    birthDate: row.birth_date ?? '',
    cpf: row.cpf ?? '',
    favoriteGenres: Array.isArray(row.favorite_genres)
      ? row.favorite_genres
      : [],
    accountType: row.account_type,
    bio: row.bio ?? '',
    location: row.location ?? '',
    avatarUrl: row.avatar_url ?? '',
    bannerUrl: row.banner_url ?? '',
    acceptedTerms: true,
  })
}

async function clearCurrentSessionQuietly() {
  try {
    await account.deleteSession('current')
  } catch {
    // Sem sessão residual — ok.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(
    null,
  )
  // Nunca hidrata "autenticado" a partir de localStorage / mock local.
  const [profile, setProfile] = useState<UserProfile>(() =>
    clearAuthenticatedSession(),
  )
  const [hasRemoteProfile, setHasRemoteProfile] = useState(false)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)

  const hydrateFromSession = useCallback(async () => {
    try {
      const current = await account.get()
      const row = await findProfileByUserId(current.$id)

      if (!row) {
        await clearCurrentSessionQuietly()
        setUser(null)
        setHasRemoteProfile(false)
        setProfile(clearAuthenticatedSession())
        return
      }

      setUser(current)
      setHasRemoteProfile(true)
      setProfile(mapRowToLocal(row, current.email))
    } catch {
      setUser(null)
      setHasRemoteProfile(false)
      setProfile(clearAuthenticatedSession())
    }
  }, [])

  const refreshSession = useCallback(async () => {
    setIsLoadingAuth(true)
    try {
      await hydrateFromSession()
    } finally {
      setIsLoadingAuth(false)
    }
  }, [hydrateFromSession])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const login = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase()

      // Encerra sessão residual antes de criar a nova.
      await clearCurrentSessionQuietly()

      await account.createEmailPasswordSession(normalizedEmail, password)

      const current = await account.get()
      const row = await findProfileByUserId(current.$id)

      if (!row) {
        await clearCurrentSessionQuietly()
        setUser(null)
        setHasRemoteProfile(false)
        setProfile(clearAuthenticatedSession())
        throw new Error(PROFILE_MISSING_ERROR)
      }

      setUser(current)
      setHasRemoteProfile(true)
      setProfile(mapRowToLocal(row, current.email))
      navigate('/home', { replace: true })
    },
    [navigate],
  )

  const logout = useCallback(async () => {
    await clearCurrentSessionQuietly()
    setUser(null)
    setHasRemoteProfile(false)
    setProfile(clearAuthenticatedSession())
    usePlayerStore.getState().stopPlayback()
    navigate('/', { replace: true })
  }, [navigate])

  const register = useCallback(async (input: RegisterAccountInput) => {
    const email = input.email.trim().toLowerCase()
    const firstName = input.firstName.trim()
    const lastName = input.lastName.trim()
    const username = cleanUsername(input.handle)
    const cpf = input.cpf.replace(/\D/g, '')
    const accountType: AppwriteAccountType = accountIntentToType(
      input.accountIntent,
    )
    const fullName = `${firstName} ${lastName}`.trim()

    await clearCurrentSessionQuietly()

    const created = await account.create(
      ID.unique(),
      email,
      input.password,
      fullName,
    )

    await account.createEmailPasswordSession(email, input.password)

    let avatarUrl = ''
    let bannerUrl = ''

    if (input.avatarFile) {
      avatarUrl = await uploadProfileImage(
        input.avatarFile,
        created.$id,
        'avatar',
      )
    }
    if (input.bannerFile) {
      bannerUrl = await uploadProfileImage(
        input.bannerFile,
        created.$id,
        'banner',
      )
    }

    const permissions = [
      Permission.read(Role.any()),
      Permission.update(Role.user(created.$id)),
      Permission.delete(Role.user(created.$id)),
    ]

    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROFILES_TABLE_ID,
      rowId: created.$id,
      data: {
        user_id: created.$id,
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        birth_date: input.birthDate,
        cpf,
        favorite_genres: input.favoriteGenres,
        account_type: accountType,
        bio: input.bio?.trim() ?? '',
        location: input.location?.trim() ?? '',
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
        onboarding_completed: true,
      },
      permissions,
    })

    const row = await findProfileByUserId(created.$id)
    if (!row) {
      await clearCurrentSessionQuietly()
      setUser(null)
      setHasRemoteProfile(false)
      setProfile(clearAuthenticatedSession())
      throw new Error(PROFILE_MISSING_ERROR)
    }

    setUser(created)
    setHasRemoteProfile(true)
    setProfile(mapRowToLocal(row, email))
    navigate('/home', { replace: true })
  }, [navigate])

  const updateProfileRemote = useCallback(
    async (input: UpdateProfileInput) => {
      const currentUser = user ?? (await account.get())
      const current = getUserProfile()

      const nextFirstName =
        input.firstName?.trim() ||
        (input.name ? input.name.trim().split(/\s+/)[0] : '') ||
        current.firstName
      const nextLastName =
        input.lastName?.trim() ||
        (input.name
          ? input.name.trim().split(/\s+/).slice(1).join(' ')
          : '') ||
        current.lastName
      const nextHandle = input.handle ?? current.handle
      const username = cleanUsername(nextHandle)

      let avatarUrl = input.avatarUrl ?? current.avatarUrl
      let bannerUrl = input.bannerUrl ?? current.bannerUrl

      if (input.avatarFile) {
        avatarUrl = await uploadProfileImage(
          input.avatarFile,
          currentUser.$id,
          'avatar',
        )
      }
      if (input.bannerFile) {
        bannerUrl = await uploadProfileImage(
          input.bannerFile,
          currentUser.$id,
          'banner',
        )
      }

      const accountType: AppwriteAccountType =
        input.accountType ??
        (input.accountIntent
          ? accountIntentToType(input.accountIntent)
          : current.accountType)

      const bio = input.bio !== undefined ? input.bio.trim() : current.bio
      const location =
        input.location !== undefined ? input.location.trim() : current.location

      await tablesDB.updateRow({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: APPWRITE_PROFILES_TABLE_ID,
        rowId: currentUser.$id,
        data: {
          first_name: nextFirstName,
          last_name: nextLastName,
          username,
          bio,
          location,
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
          account_type: accountType,
          ...(input.favoriteGenres
            ? { favorite_genres: input.favoriteGenres }
            : {}),
        },
      })

      if (input.name || input.firstName || input.lastName) {
        const fullName = `${nextFirstName} ${nextLastName}`.trim()
        if (fullName && fullName !== currentUser.name) {
          try {
            await account.updateName({ name: fullName })
          } catch {
            // Nome no Auth é best-effort.
          }
        }
      }

      const next = applyRemoteProfile({
        userId: currentUser.$id,
        firstName: nextFirstName,
        lastName: nextLastName,
        username,
        email: current.email || currentUser.email,
        birthDate: current.birthDate,
        cpf: current.cpf,
        favoriteGenres: input.favoriteGenres ?? current.favoriteGenres,
        accountType,
        bio,
        location,
        avatarUrl,
        bannerUrl,
        acceptedTerms: current.acceptedTerms,
        createdAt: current.createdAt,
      })

      setUser((prev) =>
        prev
          ? {
              ...prev,
              name: `${nextFirstName} ${nextLastName}`.trim() || prev.name,
            }
          : prev,
      )
      setHasRemoteProfile(true)
      setProfile(next)
      return next
    },
    [user],
  )

  const isAuthenticated = Boolean(user) && hasRemoteProfile

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      isAuthenticated,
      isLoading: isLoadingAuth,
      isLoadingAuth,
      login,
      logout,
      register,
      updateProfile: updateProfileRemote,
      refreshSession,
    }),
    [
      user,
      profile,
      isAuthenticated,
      isLoadingAuth,
      login,
      logout,
      register,
      updateProfileRemote,
      refreshSession,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return ctx
}

/** Atualização local otimista — preferir useAuth().updateProfile. */
export { updateUserProfile }
