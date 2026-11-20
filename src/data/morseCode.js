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


// Letter mnemonics: stressed (UPPERCASE) syllables represent dashes;
// unstressed (lowercase) syllables represent dots.
export const LETTER_MNEMONICS = {
  A: 'a - PART',
  B: 'BOB - is - the - man',
  C: 'CO - ca - CO - la',
  D: 'DOG - did - it',
  E: 'eh?',
  F: 'fetch - a - FIRE - man',
  G: 'GOOD - GRAV - y',
  H: 'hip - i - ty - hop',
  I: 'i - bid',
  J: 'in - JAWS - JAWS - JAWS',
  K: 'KANG - a - ROO',
  L: 'los - AN - ge - les',
  M: 'MMMM - MMMM',
  N: 'NU - dist',
  O: 'OH - MY - GOD',
  P: 'a - POOP - Y - smell',
  Q: 'GOD - SAVE - the - QUEEN',
  R: 'ro - TAT - ion',
  S: 'si - si - si',
  T: 'TALL',
  U: 'u - ni - FORM',
  V: 'vic - tor - y - VEE',
  W: 'the - WORLD - WAR',
  X: 'X - marks - the - SPOT',
  Y: "YOU'RE - a - COOL - DUDE",
  Z: 'ZINC - ZOO - kee - per',
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

// Memory phrases for the letters, one syllable per signal.
// CAPS = stressed syllable = dash, lowercase = quick syllable = dot.
// Say the phrase out loud and the rhythm of the stress spells the letter.
export const MNEMONICS = {
  A: ['a', 'PART'],
  B: ['BOB', 'is', 'the', 'man'],
  C: ['CO', 'ca', 'CO', 'la'],
  D: ['DOG', 'did', 'it'],
  E: ['eh?'],
  F: ['fetch', 'a', 'FIRE', 'man'],
  G: ['GOOD', 'GRAV', 'y'],
  H: ['hip', 'i', 'ty', 'hop'],
  I: ['i', 'bid'],
  J: ['in', 'JAWS', 'JAWS', 'JAWS'],
  K: ['KANG', 'a', 'ROO'],
  L: ['los', 'AN', 'ge', 'les'],
  M: ['MMMM', 'MMMM'],
  N: ['NU', 'dist'],
  O: ['OH', 'MY', 'GOD'],
  P: ['a', 'POOP', 'Y', 'smell'],
  Q: ['GOD', 'SAVE', 'the', 'QUEEN'],
  R: ['ro', 'TAT', 'ion'],
  S: ['si', 'si', 'si'],
  T: ['TALL'],
  U: ['u', 'ni', 'FORM'],
  V: ['vic', 'tor', 'y', 'VEE'],
  W: ['the', 'WORLD', 'WAR'],
  X: ['X', 'marks', 'the', 'SPOT'],
  Y: ["YOU'RE", 'a', 'COOL', 'DUDE'],
  Z: ['ZINC', 'ZOO', 'kee', 'per'],
}

// Learn mode: every character, grouped by type, never locked.
export const REFERENCE_GROUPS = GROUPS.map((group) => {
  const chars = group.stages.flatMap((stage) => stage.chars)
  return { label: group.label, chars: group.id === 'letters' ? [...chars].sort() : chars }
})
