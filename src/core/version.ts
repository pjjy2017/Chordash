export const APP_NAME = 'Chordash'
/** Shown in the about dialog; keep in step with package.json. */
export const APP_VERSION = '1.6.1'
/** Donation page; empty until it is set up (the about dialog hides the link). */
export const DONATE_URL = ''

/** Window title: `*곡.chord — Chordash` (the `*` marks unsaved changes). */
export function appTitle(fileName?: string, dirty = false): string {
  return fileName ? `${dirty ? '*' : ''}${fileName} — ${APP_NAME}` : APP_NAME
}

/** `1.10.0` is newer than `1.9.2`; a `v` in front is ignored. Unreadable versions are not newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parts = (v: string): number[] | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())
    return m ? m.slice(1).map(Number) : null
  }
  const a = parts(candidate)
  const b = parts(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}
