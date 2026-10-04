// The platform the renderer runs on. Today only Electron; a Capacitor (Android)
// implementation will be chosen here at build time later.

import { createElectronPlatform } from './electron'
import type { Platform } from './types'

export type * from './types'

export const platform: Platform = createElectronPlatform()
