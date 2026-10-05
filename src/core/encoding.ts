// Text file encodings for import (PRD 텍스트 임포트): UTF-8, UTF-8 with BOM, CP949 (EUC-KR).
// Korean text files are often CP949. Uses TextDecoder, a standard in both browsers and Node.

export type TextEncodingName = 'utf-8' | 'utf-8-bom' | 'cp949'

export interface DecodedText {
  text: string
  encoding: TextEncodingName
}

export const ENCODING_LABELS: Record<TextEncodingName, string> = {
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8 (BOM)',
  cp949: 'CP949 (EUC-KR)'
}

/** Reads bytes as UTF-8 if they are valid UTF-8, otherwise as CP949. */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    // The WHATWG "euc-kr" decoder is windows-949 (CP949), a superset of EUC-KR.
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'cp949' }
  }
}
