// Small browser helpers shared by the web and Android platforms (both run in a web page).

export interface PickerType {
  description: string
  accept: Record<string, string[]>
}

export const withoutBom = (text: string): string => text.replace(/^\uFEFF/, '')

/** The system file picker (on Android it also offers the camera for images). */
export function pickWithInput(type: PickerType, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.accept = Object.values(type.accept).flat().join(',')
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

/** Bytes as base64 (Capacitor's file plugin takes files that way). */
export function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * The browser's own share sheet where there is one for files (phones), else a download.
 * Desktop browsers have no useful one, so they download.
 */
export async function shareOrDownload(
  name: string,
  data: Uint8Array,
  mime: string,
  title: string
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([data as BlobPart], name, { type: mime })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  download(name, data, mime)
  return 'downloaded'
}

/** Saves text to the browser's downloads. */
export function download(
  name: string,
  data: string | Uint8Array,
  type = 'text/plain;charset=utf-8'
): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Shown before the first print on this device: how to get a PDF out of the print dialog. */
const PRINT_TIP_SHOWN = 'chordash.printTipShown'
export function printTip(): void {
  try {
    if (localStorage.getItem(PRINT_TIP_SHOWN)) return
    localStorage.setItem(PRINT_TIP_SHOWN, '1')
  } catch {
    // No storage: show the tip every time.
  }
  window.alert(
    '인쇄 창이 열려요.\n\n' +
      "• 대상(프린터)을 'PDF로 저장'으로 고르고 저장을 누르세요.\n" +
      "• 여백은 '기본' 또는 '없음'이면 돼요(악보에 여백이 들어 있어요).\n" +
      '• 종이 크기는 A4로 골라 주세요(Letter로 되어 있으면 바꿔 주세요).'
  )
}
