/** Word times from Hocus `POST /api/v1/audio/analyze` (lyrics_hint = script) on the Qwen WAVs. */
export type CutPaperVoiceWord = { text: string; start: number; end: number }

export type CutPaperVoiceAlign = {
  duration: number
  words: CutPaperVoiceWord[]
}

export const CUT_PAPER_VOICE_ALIGN: Record<string, CutPaperVoiceAlign> = {
  'nilo-1': {
    duration: 4.537,
    words: [
      { text: 'La', start: 0, end: 0.14 },
      { text: 'fuente', start: 0.14, end: 0.56 },
      { text: 'no', start: 0.56, end: 0.82 },
      { text: 'está', start: 0.82, end: 1.02 },
      { text: 'congelada', start: 1.02, end: 1.72 },
      { text: 'Alguien', start: 2.28, end: 2.66 },
      { text: 'le', start: 2.66, end: 2.72 },
      { text: 'pegó', start: 2.72, end: 3.02 },
      { text: 'un', start: 3.02, end: 3.08 },
      { text: 'cuadrado', start: 3.08, end: 3.54 },
      { text: 'de', start: 3.54, end: 3.66 },
      { text: 'papel', start: 3.66, end: 3.92 },
      { text: 'cebolla', start: 3.92, end: 4.44 },
    ],
  },
  'berta-1': {
    duration: 2.697,
    words: [
      { text: 'Pues', start: 0, end: 0.4 },
      { text: 'sabe', start: 0.4, end: 0.88 },
      { text: 'a', start: 0.88, end: 1.06 },
      { text: 'hielo', start: 1.06, end: 1.66 },
      { text: 'Lo', start: 1.92, end: 2.18 },
      { text: 'probé', start: 2.18, end: 2.62 },
    ],
  },
  'nilo-2': {
    duration: 1.737,
    words: [{ text: 'Berta, eso es cola.', start: 0, end: 1.737 }],
  },
  'berta-2': {
    duration: 2.457,
    words: [
      { text: 'Cola', start: 0, end: 0.38 },
      { text: 'fría', start: 0.38, end: 1.1 },
      { text: 'Como', start: 1.3, end: 1.64 },
      { text: 'hielo', start: 1.64, end: 2.32 },
    ],
  },
  'kito-1': {
    duration: 1.417,
    words: [
      { text: 'Era', start: 0, end: 0.3 },
      { text: 'un', start: 0.3, end: 0.52 },
      { text: 'sticker', start: 0.52, end: 0.96 },
    ],
  },
}

export function cutPaperLineEnd(lineId: string, start: number): number {
  return start + CUT_PAPER_VOICE_ALIGN[lineId].duration
}

export function cutPaperDialogueBeats(
  line: { id: string; speaker: string; start: number; text: string },
  start = line.start,
) {
  const align = CUT_PAPER_VOICE_ALIGN[line.id]
  const units = align.words.length ? align.words : [{ text: line.text, start: 0, end: align.duration }]
  const mouths = ['closed', 'small', 'wide', 'round'].map(state => `puppet-${line.speaker}-mouth-${state}`)
  return units.map((word, index) => ({
    id: `${line.id}-${index}`,
    text: word.text,
    start: start + word.start,
    end: start + word.end,
    mouthLayerIds: mouths,
    audioTrackId: `vo-${line.id}`,
    confidence: 'aligned-audio' as const,
  }))
}
