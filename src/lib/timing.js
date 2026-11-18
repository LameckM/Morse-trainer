// Standard morse timing: the word PARIS is 50 units, so one unit lasts 1200 / WPM milliseconds.
// Everything else is a multiple of that unit, so one speed setting drives playback and keying.
export const WPM_MIN = 5
export const WPM_MAX = 25
export const WPM_DEFAULT = 10 // 120ms per unit, same feel as the old hardcoded values

export const clampWpm = (value) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(WPM_MAX, Math.max(WPM_MIN, n)) : WPM_DEFAULT
}

export function timing(wpm) {
  const unit = 1200 / clampWpm(wpm)
  return {
    unit,
    dot: unit, // length of a dot tone
    dash: unit * 3, // length of a dash tone
    symbolGap: unit, // silence between dots and dashes inside a letter
    dashThreshold: unit * 2, // keying: a press shorter than this is a dot, longer is a dash
    // keying: how long to wait after the last release before the letter is judged.
    // Real letter spacing is 3 units, but a human needs more slack, so it scales with a 600ms floor.
    letterGap: Math.max(600, unit * 7.5),
  }
}
