export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
  G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
  M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '-': '-....-',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', ':': '---...', ';': '-.-.-.',
  '=': '-...-', '+': '.-.-.', '_': '..--.-', '"': '.-..-.', '$': '...-..-',
  '@': '.--.-.', '&': '.-...',
}

// Single source of truth. Learn, Practice and Test all read from GROUPS.
// Each group is split into stages, and every stage doubles as a Test lesson.
export const GROUPS = [
  {
    id: 'letters',
    label: 'Letters',
    stages: [
      { part: 'A-D', chars: ['A', 'B', 'C', 'D'] },
      { part: 'E-J', chars: ['E', 'F', 'G', 'H', 'I', 'J'] },
      { part: 'K-P', chars: ['K', 'L', 'M', 'N', 'O', 'P'] },
      { part: 'Q-Z', chars: ['Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'] },
    ],
  },
  {
    id: 'numbers',
    label: 'Numbers',
    stages: [
      { part: '0-4', chars: ['0', '1', '2', '3', '4'] },
      { part: '5-9', chars: ['5', '6', '7', '8', '9'] },
    ],
  },
  {
    id: 'punctuation',
    label: 'Punctuation',
    stages: [
      { part: 'Part 1', chars: ['.', ',', '?', "'", '!', '-'] },
      { part: 'Part 2', chars: ['/', '(', ')', ':', ';', '&'] },
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    stages: [
      { part: 'Part 1', chars: ['=', '+', '_'] },
      { part: 'Part 2', chars: ['"', '$', '@'] },
    ],
  },
]

// Flat, ordered list of every stage. Ids look like "letters-1" and are what progress is saved under.
export const STAGES = GROUPS.flatMap((group) =>
  group.stages.map((stage, i) => ({
    id: `${group.id}-${i + 1}`,
    groupId: group.id,
    groupLabel: group.label,
    number: i + 1,
    part: stage.part,
    label: `${group.label} ${stage.part}`,
    chars: stage.chars,
  }))
)

// Learn mode: every character, grouped by type, never locked.
export const REFERENCE_GROUPS = GROUPS.map((group) => {
  const chars = group.stages.flatMap((stage) => stage.chars)
  return { label: group.label, chars: group.id === 'letters' ? [...chars].sort() : chars }
})
