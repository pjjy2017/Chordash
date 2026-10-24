// Stop time (1.8.1): the 16 steps of a bar as the editor panel holds them, and back to text.

import type { Bar } from './document'

/** One 16th-note step: nothing, a hit with no new chord (`x`), or a chord as typed. */
export type StopStep = null | 'x' | string

/** The bar's 16 steps. A bar without `< >` starts with its chords on the beats. */
export function stopSteps(bar: Bar): StopStep[] {
  const steps: StopStep[] = Array(16).fill(null)
  if (bar.rhythm) {
    bar.rhythm.flat().forEach((s, i) => {
      steps[i] = s === 'rest' ? null : s === 'hit' ? 'x' : bar.chords[s].source
    })
    return steps
  }
  // Each chord takes its beat and the empty beats written before it.
  const slots: (string | null)[] = []
  for (const c of bar.chords) {
    for (let r = 0; r < (c.restsBefore ?? 0); r++) slots.push(null)
    slots.push(c.source)
  }
  // Three chords: the first holds two beats, as on lead sheets.
  const at =
    slots.length === 3 ? [0, 8, 12] : slots.map((_, i) => Math.floor((i * 16) / slots.length))
  slots.forEach((s, i) => {
    if (s !== null) steps[at[i]] = s
  })
  return steps
}

/** `<1C7, 7x, 13F7>`: the steps written out, skipping the empty ones. */
export function stopTimeText(steps: StopStep[]): string {
  const items = steps.flatMap((s, i) => (s === null ? [] : [`${i + 1}${s}`]))
  return `<${items.join(', ')}>`
}
