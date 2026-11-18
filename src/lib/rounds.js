export function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// How much trouble a character is giving the learner. A miss costs 2 points, a hit earns 1 back,
// so one slip needs two clean answers to fade. Capped so one bad streak can't take over every round.
export const MAX_WEAK_SCORE = 6

export function updateWeak(scores, char, wasCorrect) {
  const current = scores[char] || 0
  const next = wasCorrect ? Math.max(0, current - 1) : Math.min(MAX_WEAK_SCORE, current + 2)
  const updated = { ...scores }
  if (next === 0) delete updated[char]
  else updated[char] = next
  return updated
}

// Extra prompts a character earns in a round: 1 point of score or 2 -> +1, 3 or more -> +2.
const extraSlots = (score) => Math.min(2, Math.ceil((score || 0) / 2))

// Builds a prompt list of the given length.
// - Every character gets a near-equal share, so nothing is skipped.
// - Characters with a weak score take extra slots from the strongest ones (never below one slot each).
// - The same character never appears twice in a row (when the set has more than one character).
export function buildSequence(chars, length, scores = {}) {
  const counts = Object.fromEntries(chars.map((c) => [c, Math.floor(length / chars.length)]))
  shuffle(chars)
    .slice(0, length - Math.floor(length / chars.length) * chars.length)
    .forEach((c) => (counts[c] += 1))

  // A no-adjacent-repeats ordering only exists while no character takes more than half the slots.
  const cap = Math.ceil(length / 2)
  const weak = chars.filter((c) => scores[c] > 0).sort((a, b) => scores[b] - scores[a])
  for (const c of weak) {
    for (let i = 0; i < extraSlots(scores[c]); i++) {
      if (counts[c] + 1 > cap) break
      const donors = chars
        .filter((d) => d !== c && counts[d] > 1 && !(scores[d] > 0))
        .sort((a, b) => counts[b] - counts[a])
      if (!donors.length) break
      counts[donors[0]] -= 1
      counts[c] += 1
    }
  }

  const out = []
  let prev = null
  for (let left = length; left > 0; left--) {
    // A character holding more than half of what's left has to be placed now or it can never be separated.
    const forced = chars.find((c) => counts[c] * 2 > left && c !== prev)
    let pool = chars.filter((c) => counts[c] > 0 && c !== prev)
    if (!pool.length) pool = chars.filter((c) => counts[c] > 0) // single-character sets
    let pick = forced
    if (!pick) {
      let roll = Math.random() * pool.reduce((n, c) => n + counts[c], 0)
      pick = pool.find((c) => (roll -= counts[c]) < 0) ?? pool[pool.length - 1]
    }
    counts[pick] -= 1
    out.push(pick)
    prev = pick
  }
  return out
}
