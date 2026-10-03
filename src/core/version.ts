// Placeholder pure module so the test pipeline has something to run in Phase 0.
export const APP_NAME = 'chordpad'

export function appTitle(fileName?: string): string {
  return fileName ? `${fileName} — ${APP_NAME}` : APP_NAME
}
