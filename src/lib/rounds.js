export function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Builds a prompt list of the given length by dealing shuffled copies of chars.
// Every character shows up a near-equal number of times and the same one never appears twice in a row.
export function buildSequence(chars, length) {
  const out = []
  while (out.length < length) {
    const batch = shuffle(chars)
    if (out.length && batch.length > 1 && batch[0] === out[out.length - 1]) {
      ;[batch[0], batch[1]] = [batch[1], batch[0]]
    }
    out.push(...batch)
  }
  return out.slice(0, length)
}
