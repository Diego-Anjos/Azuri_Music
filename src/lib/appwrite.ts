import {
  Account,
  Client,
  ID,
  Permission,
  Query,
  Role,
  Storage,
  TablesDB,
} from 'appwrite'

function envOr(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || fallback
}

export const APPWRITE_ENDPOINT = envOr(
  import.meta.env.VITE_APPWRITE_ENDPOINT,
  'https://nyc.cloud.appwrite.io/v1',
)
export const APPWRITE_PROJECT_ID = envOr(
  import.meta.env.VITE_APPWRITE_PROJECT_ID,
  '6b09a3ac000d5909c4f8',
)
export const APPWRITE_DATABASE_ID = envOr(
  import.meta.env.VITE_APPWRITE_DATABASE_ID,
  'azuri_db',
)
export const APPWRITE_PROFILES_TABLE_ID = envOr(
  import.meta.env.VITE_APPWRITE_PROFILES_TABLE_ID,
  '6b09ab200019e24a121e',
)
export const APPWRITE_AVATARS_BUCKET_ID = envOr(
  import.meta.env.VITE_APPWRITE_AVATARS_BUCKET_ID,
  '6b09a94a0025a34cf773',
)

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)

export const account = new Account(client)
export const tablesDB = new TablesDB(client)
export const storage = new Storage(client)

export { client, ID, Permission, Query, Role }

export type AppwriteAccountType = 'listener' | 'artist'

export type ProfileRow = {
  $id: string
  user_id: string
  first_name: string
  last_name: string
  username: string
  email: string
  birth_date: string
  cpf: string
  favorite_genres: string[]
  account_type: AppwriteAccountType
  bio: string
  location: string
  avatar_url: string
  banner_url: string
  onboarding_completed: boolean
}

/** Traduz erros técnicos do backend em mensagens naturais do Azuri Music. */
export function getAppwriteErrorMessage(
  error: unknown,
  fallback: string,
): string {
  let raw = ''
  if (error && typeof error === 'object' && 'message' in error) {
    raw = String((error as { message: unknown }).message ?? '').trim()
  } else if (error instanceof Error) {
    raw = error.message.trim()
  }

  if (!raw) return fallback

  const lower = raw.toLowerCase()

  if (
    /invalid credentials|invalid `?email`? or `?password`?|unauthorized|401/.test(
      lower,
    )
  ) {
    return 'E-mail ou senha inválidos'
  }
  if (
    /user with the (same )?email|email already exists|already exists/.test(
      lower,
    )
  ) {
    return 'Já existe uma conta com este e-mail'
  }
  if (/password.{0,40}(least|minimum|short|8)/.test(lower)) {
    return 'A senha precisa ter pelo menos 8 caracteres'
  }
  if (/network|failed to fetch|fetch failed|cors|load failed|timeout/.test(lower)) {
    return 'Não foi possível conectar ao servidor do Azuri Music'
  }
  if (/rate limit|too many requests|429/.test(lower)) {
    return 'Muitas tentativas. Aguarde um momento e tente novamente'
  }
  // Nunca expor nomes de provedores ou detalhes técnicos ao usuário.
  if (/appwrite|nyc\.cloud|project|collection|document|table/i.test(raw)) {
    return fallback || 'Não foi possível conectar ao servidor do Azuri Music'
  }

  return raw
}

export function cleanUsername(handle: string): string {
  return handle.replace(/^@+/, '').trim().toLowerCase()
}

export async function uploadProfileImage(
  file: File,
  userId: string,
  kind: 'avatar' | 'banner',
): Promise<string> {
  const extension = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.'))
    : '.jpg'
  const namedFile = new File([file], `${kind}-${userId}${extension}`, {
    type: file.type || 'image/jpeg',
  })

  const uploaded = await storage.createFile({
    bucketId: APPWRITE_AVATARS_BUCKET_ID,
    fileId: ID.unique(),
    file: namedFile,
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  })

  return storage.getFileView({
    bucketId: APPWRITE_AVATARS_BUCKET_ID,
    fileId: uploaded.$id,
  })
}

export async function findProfileByUserId(
  userId: string,
): Promise<ProfileRow | null> {
  const result = await tablesDB.listRows({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: APPWRITE_PROFILES_TABLE_ID,
    queries: [Query.equal('user_id', userId), Query.limit(1)],
  })

  const row = result.rows[0] as unknown as ProfileRow | undefined
  return row ?? null
}

/** Ping real de leitura mínima na tabela profiles (diagnóstico de CORS/permissões). */
export async function checkDatabaseConnection(): Promise<{
  ok: boolean
  latencyMs: number
  error?: string
}> {
  const started = performance.now()
  try {
    await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROFILES_TABLE_ID,
      queries: [Query.limit(1)],
    })
    return { ok: true, latencyMs: Math.round(performance.now() - started) }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started)
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message ?? '').trim()
        : err instanceof Error
          ? err.message
          : 'Falha desconhecida'
    return {
      ok: false,
      latencyMs,
      error: message || 'Falha desconhecida',
    }
  }
}

export async function findProfileByUsername(
  username: string,
): Promise<ProfileRow | null> {
  const result = await tablesDB.listRows({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: APPWRITE_PROFILES_TABLE_ID,
    queries: [Query.equal('username', username), Query.limit(1)],
  })

  const row = result.rows[0] as unknown as ProfileRow | undefined
  return row ?? null
}
