// Android app (ROADMAP Phase 12): the web build (`npm run build:web` → dist-web) inside a
// Capacitor shell. `npx cap sync android` copies it into the android/ project.

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.chordash.app',
  appName: 'Chordash',
  webDir: 'dist-web',
  android: {
    // Files and the AI go through native plugins; nothing loads over plain http.
    allowMixedContent: false
  }
}

export default config
