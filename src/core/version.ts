export const APP_NAME = 'Chordash'
/** Shown in the about dialog; keep in step with package.json. */
export const APP_VERSION = '1.2.0'
/** Donation page; empty until it is set up (the about dialog hides the link). */
export const DONATE_URL = ''

/** Window title: `*곡.chord — Chordash` (the `*` marks unsaved changes). */
export function appTitle(fileName?: string, dirty = false): string {
  return fileName ? `${dirty ? '*' : ''}${fileName} — ${APP_NAME}` : APP_NAME
}
