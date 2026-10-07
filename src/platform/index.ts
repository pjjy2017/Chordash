// The platform the renderer runs on: the Electron desktop app when its preload bridge is
// there, the Android app inside Capacitor, otherwise the web version (GitHub Pages).

import { Capacitor } from '@capacitor/core'
import { createAndroidPlatform } from './android'
import { createElectronPlatform } from './electron'
import { createWebPlatform } from './web'
import type { Platform } from './types'

export type * from './types'

/**
 * Development only: `?platform=android` tries the Android screens in a browser, where the
 * plugins fall back to web versions (files in browser storage).
 */
const tryAndroid =
  import.meta.env.DEV && new URLSearchParams(location.search).get('platform') === 'android'

export const platform: Platform =
  'chordashBridge' in window
    ? createElectronPlatform()
    : Capacitor.isNativePlatform() || tryAndroid
      ? createAndroidPlatform()
      : createWebPlatform()
