// In-app updates for the Android app (1.5): GitHub's latest release tells whether there is a
// newer APK; the app's own plugin (ApkInstallerPlugin.java) downloads it and opens Android's
// installer. The user always taps "설치" there — an APK from outside the Play Store cannot
// update itself silently.

import { CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { APP_VERSION, isNewerVersion } from '../../core/version'
import type { Updates } from '../types'

const LATEST = 'https://api.github.com/repos/pjjy2017/Chordash/releases/latest'

interface ApkInstaller {
  install(options: { url: string }): Promise<void>
  addListener(
    event: 'progress',
    listener: (data: { percent: number }) => void
  ): Promise<PluginListenerHandle>
}

const ApkInstaller = registerPlugin<ApkInstaller>('ApkInstaller')

interface Release {
  tag_name: string
  assets: { name: string; browser_download_url: string }[]
}

let apkUrl: string | null = null

export const androidUpdates: Updates = {
  installLabel: '받기',

  async check() {
    // Offline or no answer: the error goes to the page, which says so only when asked.
    const response = await CapacitorHttp.get({
      url: LATEST,
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (response.status !== 200) throw new Error(`GitHub ${response.status}`)
    const release = response.data as Release
    const apk = release.assets.find((a) => a.name.toLowerCase().endsWith('-android.apk'))
    if (!apk || !isNewerVersion(release.tag_name, APP_VERSION)) return null
    apkUrl = apk.browser_download_url
    return { version: release.tag_name.replace(/^v/, '') }
  },

  async install(progress) {
    if (!apkUrl) throw new Error('새 버전을 먼저 확인해 주세요.')
    const listener = await ApkInstaller.addListener('progress', (d) => progress(d.percent))
    try {
      await ApkInstaller.install({ url: apkUrl })
    } catch (error) {
      if (error instanceof Error && error.message === 'permission')
        throw new Error('"이 출처의 앱 설치 허용"을 켠 뒤, 돌아와서 다시 [받기]를 눌러 주세요.')
      throw new Error('새 버전을 내려받지 못했어요. 인터넷 연결을 확인해 주세요.')
    } finally {
      await listener.remove()
    }
  }
}
