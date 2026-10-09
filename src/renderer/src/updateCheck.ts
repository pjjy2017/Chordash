// New versions from inside the app (1.5). A few seconds after start the app asks GitHub once;
// a newer version shows a bar: "새 버전 x.y.z이 나왔어요 [업데이트/받기] [나중에]". The about box
// has "업데이트 확인" for asking again.

import type { UpdateInfo, Updates } from '../../platform'
import { showNotice, updateNotice } from './notice'

let updates: Updates | null = null
/** Ready to leave this version: unsaved changes are saved or let go. false = not now. */
let readyToLeave: () => Promise<boolean> = async () => true

async function install(info: UpdateInfo): Promise<boolean> {
  if (!updates || !(await readyToLeave())) return false
  showNotice(`${info.version} 내려받는 중… 0%`, [])
  try {
    await updates.install((percent) =>
      updateNotice(`${info.version} 내려받는 중… ${Math.round(percent)}%`)
    )
    // Desktop restarts on its own; Android shows its installer.
    updateNotice(
      updates.installLabel === '받기'
        ? `설치 화면에서 "설치"를 누르면 ${info.version}이 돼요. 곡 파일은 그대로 남아요.`
        : `${info.version}으로 다시 시작해요…`
    )
  } catch (error) {
    offer(info, error instanceof Error ? error.message : String(error))
  }
  return false
}

function offer(info: UpdateInfo, problem?: string): void {
  if (!updates) return
  showNotice(problem ?? `새 버전 ${info.version}이 나왔어요.`, [
    { label: problem ? '다시' : updates.installLabel, primary: true, run: () => install(info) },
    { label: '나중에', run: () => undefined }
  ])
}

/** Asks GitHub now; the answer for the about box ("최신 버전이에요" / the bar). */
export async function checkForUpdate(): Promise<string> {
  if (!updates) return ''
  let info: UpdateInfo | null
  try {
    info = await updates.check()
  } catch {
    return '확인하지 못했어요. 인터넷 연결을 확인해 주세요.'
  }
  if (!info) return '최신 버전이에요.'
  offer(info)
  return `새 버전 ${info.version}이 있어요.`
}

export function installUpdateCheck(
  platformUpdates: Updates,
  beforeLeaving: () => Promise<boolean>
): void {
  updates = platformUpdates
  readyToLeave = beforeLeaving
  // After start-up, so it never slows down opening the app.
  window.setTimeout(() => void checkForUpdate(), 4000)
}
