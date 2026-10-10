// Share links (1.6): the whole song squeezed into the address, after `#` — the part of a link
// that browsers never send to the server. https://chordash.app/#s=1.<data> opens it.

const PREFIX = 's=1.'
export const SHARE_ORIGIN = 'https://chordash.app/'

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function through(
  bytes: Uint8Array<ArrayBuffer>,
  stream: GenericTransformStream
): Promise<Uint8Array<ArrayBuffer>> {
  const piped = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

/** The link for a song: its text, compressed. */
export async function shareLink(text: string): Promise<string> {
  const packed = await through(new TextEncoder().encode(text), new CompressionStream('deflate-raw'))
  return `${SHARE_ORIGIN}#${PREFIX}${toBase64Url(packed)}`
}

/** The song in a link's `#…` part, or null when it is not a Chordash song link (or is broken). */
export async function readShareLink(hash: string): Promise<string | null> {
  const part = hash.replace(/^#/, '')
  if (!part.startsWith(PREFIX)) return null
  try {
    const bytes = await through(
      fromBase64Url(part.slice(PREFIX.length)),
      new DecompressionStream('deflate-raw')
    )
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
