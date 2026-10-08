// Google Drive as a library place for the web version (1.3): the "Chordash" folder in the user's
// own Drive. Sign-in is Google Identity Services' token flow in a popup — no server, no client
// secret. The scope is drive.file: the app sees only the files it made itself.
// The client ID is public by design (it names the app to Google; it is not a secret).

import type { FolderFile, LibraryStore } from '../library'

const CLIENT_ID = '976077296536-73snh5ssfobiqatkguk6n1ev7n1lrosv.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = 'Chordash'
const FOLDER_ID = 'chordash.driveFolder'

/** The parts of Google Identity Services used here. */
interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string }) => void
  }): { requestAccessToken(options?: { prompt?: string }): void }
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth } }
  }
}

let token: { value: string; expires: number } | null = null
let gis: Promise<void> | null = null

function loadGis(): Promise<void> {
  gis ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gis = null
      reject(new Error('구글 로그인을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'))
    }
    document.head.append(script)
  })
  return gis
}

const isConnected = (): boolean => token !== null && token.expires > Date.now() + 30_000

/**
 * Signs in with a Google popup. false when the user closed it or the popup was blocked.
 * With the library already loaded (warmUp), the popup opens within the click itself.
 */
async function connect(): Promise<boolean> {
  if (!window.google) {
    try {
      await loadGis()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      return false
    }
  }
  return new Promise((resolve) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) return resolve(false)
        token = {
          value: response.access_token,
          expires: Date.now() + (response.expires_in ?? 3600) * 1000
        }
        resolve(true)
      },
      error_callback: (error) => {
        if (error.type === 'popup_failed_to_open')
          window.alert('구글 로그인 창이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요.')
        resolve(false)
      }
    })
    client.requestAccessToken({ prompt: '' })
  })
}

/** A Drive call with the token; signs in again first when the token has run out. */
async function call(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isConnected() && !(await connect())) throw new Error('구글 드라이브에 연결되지 않았어요.')
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token!.value}` }
  })
  if (response.status === 401) {
    token = null
    throw new Error('구글 로그인이 만료됐어요. 다시 시도해 주세요.')
  }
  if (!response.ok) throw new Error(`구글 드라이브 오류 (${response.status})`)
  return response
}

/** Drive search strings quote with ' and escape \ and '. */
const quote = (text: string): string => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

async function search(
  q: string,
  fields = 'files(id)'
): Promise<{ id: string; name?: string; modifiedTime?: string }[]> {
  const params = new URLSearchParams({
    q,
    fields,
    spaces: 'drive',
    pageSize: '200',
    orderBy: 'modifiedTime desc'
  })
  const body = (await (await call(`${API}/files?${params}`)).json()) as {
    files: { id: string; name?: string; modifiedTime?: string }[]
  }
  return body.files
}

/** The Chordash folder in Drive, made the first time. */
async function folderId(): Promise<string> {
  try {
    const known = localStorage.getItem(FOLDER_ID)
    if (known) return known
  } catch {
    // Look it up.
  }
  const [found] = await search(
    `name = ${quote(FOLDER_NAME)} and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )
  let id = found?.id
  if (!id) {
    const response = await call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    })
    id = ((await response.json()) as { id: string }).id
  }
  try {
    localStorage.setItem(FOLDER_ID, id)
  } catch {
    // Looked up again next time.
  }
  return id
}

async function fileId(name: string): Promise<string | null> {
  const folder = await folderId()
  const [found] = await search(
    `name = ${quote(name)} and ${quote(folder)} in parents and trashed = false`
  )
  return found?.id ?? null
}

async function list(extension: string): Promise<FolderFile[]> {
  const folder = await folderId()
  const files = await search(
    `${quote(folder)} in parents and trashed = false and name contains ${quote(extension)}`,
    'files(id,name,modifiedTime)'
  )
  const seen = new Set<string>()
  return files
    .filter(
      (f) => f.name?.toLowerCase().endsWith(extension) && !seen.has(f.name) && seen.add(f.name)
    )
    .map((f) => ({ name: f.name!, mtime: Date.parse(f.modifiedTime ?? '') || 0 }))
}

async function read(name: string): Promise<string | null> {
  const id = await fileId(name)
  if (!id) return null
  return (await (await call(`${API}/files/${id}?alt=media`)).text()).replace(/^\uFEFF/, '')
}

async function write(name: string, text: string): Promise<void> {
  const id = await fileId(name)
  if (id) {
    await call(`${UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: text
    })
    return
  }
  const folder = await folderId()
  const form = new FormData()
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name, parents: [folder], mimeType: 'text/plain' })], {
      type: 'application/json'
    })
  )
  form.append('file', new Blob([text], { type: 'text/plain; charset=utf-8' }))
  await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form })
}

export const driveStore: LibraryStore = {
  id: 'drive',
  label: '구글 드라이브',
  where: '내 구글 드라이브의 Chordash 폴더 — 로그인한 어느 기기에서나 같은 곡이 보여요.',
  saveTo: '구글 드라이브의 Chordash 폴더에',
  connectNote:
    '구글로 로그인하면 내 드라이브의 Chordash 폴더에 저장해요. Chordash는 자기가 만든 파일만 볼 수 있어요.',
  isConnected,
  connect,
  warmUp: () => void loadGis().catch(() => undefined),
  list,
  read,
  exists: async (name) => (await fileId(name)) !== null,
  write
}
