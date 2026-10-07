// The platform the renderer runs on: the Electron desktop app when its preload bridge is
// there, otherwise the web version (GitHub Pages). A Capacitor (Android) implementation will
// be chosen here later.

import { createElectronPlatform } from './electron'
import { createWebPlatform } from './web'
import type { Platform } from './types'

export type * from './types'

export const platform: Platform =
  'chordashBridge' in window ? createElectronPlatform() : createWebPlatform()
