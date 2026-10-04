export const APP_NAME = 'Chordash'

/** Window title: `*곡.chord — Chordash` (the `*` marks unsaved changes). */
export function appTitle(fileName?: string, dirty = false): string {
  return fileName ? `${dirty ? '*' : ''}${fileName} — ${APP_NAME}` : APP_NAME
}
