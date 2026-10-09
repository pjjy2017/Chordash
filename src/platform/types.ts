// What the app needs from the device it runs on. The renderer talks only to this interface
// (CLAUDE.md 구조 원칙); Electron is one implementation, Capacitor (Android) will be another.

import type { RecognizeFailure } from '../core/recognize'

/** A file chosen by the user. `id` is opaque: a path on desktop, a content URI on Android. */
export interface FileRef {
  id: string
  /** File name to show, e.g. `Chordash.chord`. */
  name: string
}

/** A file picked for import, unread: the bytes are decoded by the core (UTF-8 / CP949). */
export interface ImportedFile {
  file: FileRef
  data: Uint8Array
}

/**
 * What "열기" gives back (1.4: opening and importing are one command): a Chordash song, another
 * file to convert (a text chart, or a photo/PDF for the AI), or a request to paste text.
 */
export type OpenResult =
  | { kind: 'song'; file: FileRef; text: string }
  | { kind: 'import'; picked: ImportedFile }
  | { kind: 'paste' }

/** A newer version on GitHub Releases (1.5). */
export interface UpdateInfo {
  version: string
}

/** Updating from inside the app (desktop and Android, 1.5). */
export interface Updates {
  /** A newer version than this one, or null. Fails when GitHub cannot be reached. */
  check(): Promise<UpdateInfo | null>
  /**
   * Gets it and installs it. Desktop: downloads, then restarts into the new version.
   * Android: downloads the APK and opens Android's installer (the user taps "설치").
   * `progress` gets 0–100 while downloading.
   */
  install(progress: (percent: number) => void): Promise<void>
  /** The button's word: "업데이트" or "받기". */
  installLabel: string
}

/** Who is signed in to a cloud place (web: Google Drive). */
export interface Profile {
  name: string
  email: string
  /** Picture URL; empty when there is none. */
  photo: string
}

/** A place to save new songs, for the account menu's switch. */
export interface SavePlace {
  id: string
  label: string
}

/** Signing in to the cloud place (web only, 1.4): shown as a button at the right end. */
export interface Account {
  /** Signed in right now (the sign-in lasts about an hour). */
  connected(): boolean
  /** Who signed in last on this device, kept to show while signed out; null if nobody. */
  profile(): Profile | null
  /** Opens Google's sign-in popup; false when closed or blocked. Call from a click. */
  signIn(): Promise<boolean>
  /** Signs out and forgets the profile; new songs go back to this device. */
  signOut(): void
  /** Gets sign-in ready early, so the popup opens straight from the click. */
  warmUp(): void
  /** Runs whenever the sign-in or the profile changes (also when it runs out). */
  onChange(listener: () => void): void
  places: SavePlace[]
  /** Where new songs are saved. */
  place(): string
  setPlace(id: string): void
}

/** A page image sent to the AI, base64 without the `data:` prefix. */
export interface ChartImage {
  mediaType: 'image/jpeg' | 'image/png'
  data: string
}

/** One request to read a chart. The platform sends it with the stored API key. */
export interface RecognizeRequest {
  model: string
  system: string
  /** Page images in order; empty when only text is sent. */
  images: ChartImage[]
  prompt: string
}

export type RecognizeResult =
  | {
      ok: true
      text: string
      /** The answer hit the length limit and may be cut off. */
      truncated: boolean
    }
  | { ok: false; failure: RecognizeFailure }

/** One song of a setlist. */
export interface SetlistSong {
  file: FileRef
  /** Key to print it in, as typed (`G`, `e-`); null = as written in the song. */
  key: string | null
  /** false when the file listed in the setlist is not there any more. */
  found: boolean
}

export interface Setlist {
  title: string | null
  songs: SetlistSong[]
}

export interface OpenedSetlist {
  file: FileRef
  setlist: Setlist
}

export type DiscardChoice = 'save' | 'discard' | 'cancel'

export interface DocumentState {
  /** Name to show, e.g. `Chordash.chord` or `제목 없음`. */
  name: string
  dirty: boolean
}

/** What this platform can do; the screen hides or explains what it cannot. */
export interface PlatformFeatures {
  /** Reading charts with the AI (needs an API key kept safely on the device). */
  ai: boolean
  /** PDFs come from the browser's print dialog ("PDF로 저장") instead of a saved file. */
  printPdf: boolean
  /** Setlists keep copies of their songs, since song files cannot be found again later. */
  setlistKeepsSongs: boolean
  /** The web version points to the desktop and Android apps in its menu. */
  offersDesktopApp: boolean
  /** The website shows its privacy policy and terms links on the page (Google sign-in review). */
  legalLinks: boolean
  /**
   * "열기" is Chordash's own list (web, Android), which also offers pasting text. The desktop
   * uses the system's file dialog, so pasting stays in the ⋯ menu there.
   */
  libraryDialog: boolean
}

export interface Platform {
  features: PlatformFeatures
  /** Asks for a song — or any chart file to convert, or pasting. null when cancelled. */
  openFile(): Promise<OpenResult | null>
  /** Songs opened or saved lately, newest first (desktop; elsewhere the library lists them). */
  recentFiles?(): Promise<FileRef[]>
  /** Opens a song from the recent list; null when it is not there any more. */
  openRecent?(file: FileRef): Promise<OpenResult | null>
  /** New versions from inside the app; the web version is always the newest and has none. */
  updates?: Updates
  /** Signing in to a cloud place; only the web version has one. */
  account?: Account
  /** Saves to `file`, or asks where when it is null. Returns where it saved, null when cancelled. */
  saveFile(file: FileRef | null, text: string): Promise<FileRef | null>
  /** Always asks where to save. Returns where it saved, null when cancelled. */
  saveFileAs(file: FileRef | null, text: string): Promise<FileRef | null>
  /**
   * Turns a standalone HTML document (A4 pages, fonts embedded) into a PDF and asks where to
   * save it. Returns where it saved, null when cancelled.
   */
  exportPdf(html: string, suggestedName: string): Promise<FileRef | null>
  /** Asks whether to save unsaved changes to the named document. */
  confirmDiscard(name: string): Promise<DiscardChoice>
  /** Shows the document name and unsaved state where the platform can (desktop: window title). */
  setDocumentState(state: DocumentState): void
  /**
   * Runs before the app or window closes while there are unsaved changes.
   * The handler resolves true to let it close.
   */
  onBeforeClose(handler: () => Promise<boolean>): void
  /** Asks for song files to add to a setlist, in the order picked. Empty when cancelled. */
  pickSongs(): Promise<FileRef[]>
  /** Reads a song file; null when it cannot be read. */
  readSong(file: FileRef): Promise<string | null>
  /** Asks for a setlist file and reads it, finding its songs. null when cancelled. */
  openSetlist(): Promise<OpenedSetlist | null>
  /**
   * Saves a setlist to `file`, or asks where when it is null. Songs are written relative to the
   * setlist where possible. Returns where it saved, null when cancelled.
   */
  saveSetlist(file: FileRef | null, setlist: Setlist): Promise<FileRef | null>
  /** Whether an Anthropic API key is stored on this device. The key itself never comes back. */
  hasApiKey(): Promise<boolean>
  /**
   * Checks the key with Anthropic and stores it encrypted on this device; null deletes it.
   * Resolves with a message for the user when it could not be stored, null on success.
   */
  setApiKey(key: string | null): Promise<string | null>
  /** Sends page images (or text) to the AI with the stored key. Never throws. */
  recognize(request: RecognizeRequest): Promise<RecognizeResult>
  /** Stops the running recognize request; it then resolves as cancelled. */
  cancelRecognize(): void
}
