import { useState, useRef, useEffect } from 'react'
import { MORSE, LESSONS, REFERENCE_GROUPS } from '../data/morseCode.js'
import { Check, Lock, Zap, Trash2 } from 'lucide-react'

const DOT_MS = 120
const DASH_THRESHOLD_MS = 250
const GAP_MS = 900
const RAMP_S = 0.01
const PASS_RATE = 0.75
const PRACTICE_PASS_RATE = 0.9
const PRACTICE_LETTER_PROGRESS_KEY = 'a4o-morse-practice-letter-progress'
const CORRECT_DELAY_MS = 700
const WRONG_DELAY_MS = 1500
const PROGRESS_KEY = 'a4o-morse-progress'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const needed = (total, rate = PASS_RATE) => Math.ceil(rate * total)
const neededPractice = (total) => Math.floor(PRACTICE_PASS_RATE * total)
const speak = (pattern) => [...pattern].map((s) => (s === '.' ? 'dot' : 'dash')).join(' ')

function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function PatternBars({ pattern }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[...pattern].map((s, i) => (
        <span key={i} className={`bg-signal rounded-sm h-2 ${s === '.' ? 'w-2' : 'w-6'}`} />
      ))}
    </span>
  )
}

function useBeep() {
  const ctxRef = useRef(null)
  const activeRef = useRef(null)
  const playToken = useRef(0)

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    // Safari and iOS create the context suspended until a user gesture resumes it.
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }

  const start = () => {
    if (activeRef.current) return
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 600
    osc.type = 'sine'
    // Short fade in and out so the tone doesn't click.
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + RAMP_S)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    activeRef.current = { osc, gain, ctx }
  }

  const stop = () => {
    const active = activeRef.current
    if (!active) return
    activeRef.current = null
    const { osc, gain, ctx } = active
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + RAMP_S)
    osc.stop(now + RAMP_S)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }

  // Stops any pattern that is currently playing.
  const cancel = () => {
    playToken.current += 1
    stop()
  }

  // Starting a new pattern cancels the previous one, so double taps restart instead of overlapping.
  const playPattern = async (pattern) => {
    const token = ++playToken.current
    for (const symbol of pattern) {
      if (token !== playToken.current) return
      start()
      await sleep(symbol === '.' ? DOT_MS : DOT_MS * 3)
      if (token !== playToken.current) return
      stop()
      await sleep(DOT_MS)
    }
  }

  return { start, stop, playPattern, cancel }
}

export default function MorseTrainer() {
  const [completed, setCompleted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || []
    } catch {
      return []
    }
  })
  const [lessonId, setLessonId] = useState(LESSONS[0].id)
  const [mode, setMode] = useState(() => (completed.length ? 'practice' : 'learn'))
  const [order, setOrder] = useState(() => shuffle(LESSONS[0].chars))
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [buffer, setBuffer] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [guess, setGuess] = useState(null)
  const [roundResult, setRoundResult] = useState(null)
  const [streak, setStreak] = useState(0)
  const [learnCategory, setLearnCategory] = useState('All')
  const [practiceCategory, setPracticeCategory] = useState('Letters')
  const [practiceLetterSectionId, setPracticeLetterSectionId] = useState(1)
  const [completedPracticeLetterSections, setCompletedPracticeLetterSections] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PRACTICE_LETTER_PROGRESS_KEY)) || []
    } catch {
      return []
    }
  })

  const pressStart = useRef(null)
  const gapTimer = useRef(null)
  const feedbackTimer = useRef(null)
  const { start, stop, playPattern, cancel } = useBeep()

  const lesson = LESSONS.find((l) => l.id === lessonId)
  const targetChar = order[index]
  const targetPattern = MORSE[targetChar]
  const practiceGroupLabel = practiceCategory === 'Special characters' ? 'Symbols' : practiceCategory
  const practiceLetterSection = LESSONS.find((item) => item.id === practiceLetterSectionId)
  const practiceChars = practiceCategory === 'Letters'
    ? practiceLetterSection.chars
    : REFERENCE_GROUPS.find((group) => group.label === practiceGroupLabel)?.chars ?? REFERENCE_GROUPS[0].chars
  const activeChars = mode === 'practice' ? practiceChars : lesson.chars
  const visibleReferenceGroups = learnCategory === 'All'
    ? REFERENCE_GROUPS
    : REFERENCE_GROUPS.filter((group) => group.label === learnCategory)
  const visibleCharacterCount = visibleReferenceGroups.reduce((total, group) => total + group.chars.length, 0)

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed))
  }, [completed])

  useEffect(() => {
    localStorage.setItem(PRACTICE_LETTER_PROGRESS_KEY, JSON.stringify(completedPracticeLetterSections))
  }, [completedPracticeLetterSections])

  // Practice mode owns the spacebar. In other modes it keeps its normal job (pressing focused buttons).
  useEffect(() => {
    if (mode !== 'practice') return
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (!e.repeat) handleDown()
    }
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      handleUp()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  useEffect(() => {
    return () => {
      clearTimers()
      cancel()
    }
  }, [])

  const clearTimers = () => {
    clearTimeout(gapTimer.current)
    clearTimeout(feedbackTimer.current)
    gapTimer.current = null
    feedbackTimer.current = null
  }

  // Throws away anything in flight (timers, sounds, half-sent letters) and starts a fresh shuffled round.
  const resetRound = (chars) => {
    clearTimers()
    cancel()
    pressStart.current = null
    setOrder(shuffle(chars))
    setIndex(0)
    setCorrect(0)
    setBuffer([])
    setFeedback(null)
    setGuess(null)
    setRoundResult(null)
  }

  const advance = (wasCorrect) => {
    if (index === 0) setRoundResult(null)
    setFeedback(wasCorrect ? 'correct' : 'wrong')
    setStreak((s) => (wasCorrect ? s + 1 : 0))
    const newCorrect = correct + (wasCorrect ? 1 : 0)
    setCorrect(newCorrect)

    feedbackTimer.current = setTimeout(
      () => {
        setFeedback(null)
        setGuess(null)
        setBuffer([])
        if (index + 1 >= order.length) {
          const passRate = mode === 'practice' ? PRACTICE_PASS_RATE : PASS_RATE
          const requiredCorrect = mode === 'practice' ? neededPractice(order.length) : needed(order.length, passRate)
          const passed = newCorrect >= requiredCorrect
          setRoundResult({ correct: newCorrect, total: order.length, passed })
          if (passed && mode === 'practice' && practiceCategory === 'Letters') {
            setCompletedPracticeLetterSections((sections) =>
              sections.includes(practiceLetterSectionId)
                ? sections
                : [...sections, practiceLetterSectionId]
            )
          }
          if (passed && mode !== 'practice') {
            setCompleted((c) => (c.includes(lessonId) ? c : [...c, lessonId]))
          }
          setOrder(shuffle(activeChars))
          setIndex(0)
          setCorrect(0)
        } else {
          setIndex((i) => i + 1)
        }
      },
      wasCorrect ? CORRECT_DELAY_MS : WRONG_DELAY_MS
    )
  }

  const handleDown = () => {
    if (feedback || mode !== 'practice') return
    if (pressStart.current !== null) return
    clearTimeout(gapTimer.current)
    pressStart.current = performance.now()
    start()
  }

  const handleUp = () => {
    if (pressStart.current === null) return
    stop()
    const duration = performance.now() - pressStart.current
    pressStart.current = null
    const symbol = duration < DASH_THRESHOLD_MS ? '.' : '-'
    const next = [...buffer, symbol]
    setBuffer(next)
    clearTimeout(gapTimer.current)
    gapTimer.current = setTimeout(() => {
      advance(next.join('') === targetPattern)
    }, GAP_MS)
  }

  const runTest = async () => {
    if (feedback) return
    await playPattern(targetPattern)
  }

  const handleGuess = (letter) => {
    if (feedback) return
    setGuess(letter)
    advance(letter === targetChar)
  }

  const changeMode = (m) => {
    if (m === mode) return
    setMode(m)
    resetRound(m === 'practice' ? practiceChars : lesson.chars)
  }

  const selectPracticeCategory = (category) => {
    setPracticeCategory(category)
    const groupLabel = category === 'Special characters' ? 'Symbols' : category
    const chars = category === 'Letters'
      ? practiceLetterSection.chars
      : REFERENCE_GROUPS.find((group) => group.label === groupLabel)?.chars ?? []
    resetRound(chars)
  }

  const selectPracticeLetterSection = (id) => {
    const sectionIndex = LESSONS.findIndex((item) => item.id === id)
    const isLocked = sectionIndex > 0 && !completedPracticeLetterSections.includes(LESSONS[sectionIndex - 1].id)
    if (isLocked) return
    setPracticeCategory('Letters')
    setPracticeLetterSectionId(id)
    resetRound(LESSONS.find((item) => item.id === id).chars)
  }

  const selectLesson = (id) => {
    setLessonId(id)
    resetRound(LESSONS.find((l) => l.id === id).chars)
  }

  const clearProgress = () => {
    const ok = window.confirm("Clear all lesson progress? This can't be undone.")
    if (!ok) return
    localStorage.removeItem(PROGRESS_KEY)
    setCompleted([])
    setLessonId(LESSONS[0].id)
    resetRound(LESSONS[0].chars)
    setStreak(0)
  }

  const subtitle = {
    learn: 'See each pattern and hear how it sounds',
    practice: 'Hold the button or spacebar to key',
    test: 'Listen, then pick the character',
  }[mode]

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-medium">{mode === 'learn' ? 'All characters' : mode === 'practice' ? `Practice: ${practiceCategory}` : lesson.label}</p>
          <p className="text-sm text-neutral-400">{subtitle}</p>
        </div>
        <div className="flex gap-1 bg-panel border border-line rounded-lg p-1">
          {['learn', 'practice', 'test'].map((m) => (
            <button
              key={m}
              onClick={() => changeMode(m)}
              className={`text-sm px-3 py-1.5 rounded-md capitalize ${
                mode === m ? 'bg-ink text-neutral-100' : 'text-neutral-400'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-5 ${mode === 'learn' ? '' : 'md:grid-cols-[1.3fr_1fr]'}`}>
        <div className="bg-panel border border-line rounded-xl p-8 flex flex-col items-center">
          {mode === 'learn' && (
            <>
              <div className="w-full mb-5">
                <p className="text-sm text-neutral-500 mb-3">
                  Explore the complete Morse alphabet. Select any character to hear its code.
                  Learn mode is always open; lesson progress does not restrict it.
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter learning characters">
                  {['All', 'Letters', 'Numbers', 'Punctuation', 'Symbols'].map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setLearnCategory(category)}
                      aria-pressed={learnCategory === category}
                      className={`text-xs px-3 py-2 rounded-full border transition-colors ${
                        learnCategory === category
                          ? 'border-signal bg-signal/10 text-signal'
                          : 'border-line text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-3">
                  {visibleCharacterCount} characters available
                </p>
              </div>
              <div className="flex flex-col gap-6 w-full">
                {visibleReferenceGroups.map((group) => (
                  <section key={group.label}>
                    <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{group.label}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {group.chars.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => playPattern(MORSE[c])}
                          aria-label={`${c}, ${speak(MORSE[c])}. Play sound`}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-line hover:border-signal hover:bg-signal/5 transition-colors"
                        >
                          <span className="font-display text-lg">{c}</span>
                          <PatternBars pattern={MORSE[c]} />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-6 self-start">
                Learn at your own pace. Switch to Practice or Test whenever you're ready.
              </p>
            </>
          )}

          {mode === 'practice' && (
            <>
              <p className="text-sm text-neutral-500 mb-4">Send this character</p>
              <p className="font-display text-4xl mb-6">{targetChar}</p>
              <button
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.currentTarget.setPointerCapture?.(e.pointerId)
                  handleDown()
                }}
                onPointerUp={handleUp}
                onPointerCancel={handleUp}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="Key a dot or dash"
                className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-colors select-none touch-none ${
                  feedback === 'correct'
                    ? 'bg-green-500/20 border-green-500'
                    : feedback === 'wrong'
                    ? 'bg-red-500/20 border-red-500'
                    : 'bg-signal/10 border-signal'
                }`}
              >
                <Zap
                  size={28}
                  className={
                    feedback === 'correct'
                      ? 'text-green-400'
                      : feedback === 'wrong'
                      ? 'text-red-400'
                      : 'text-signal'
                  }
                />
              </button>
              <p className="text-xs text-neutral-500 mt-4">Tap for a dot, hold for a dash</p>
              <div className="flex gap-1 mt-4 h-5">
                {buffer.map((s, i) => (
                  <span key={i} className={`bg-signal rounded-sm h-5 ${s === '.' ? 'w-2' : 'w-5'}`} />
                ))}
              </div>
            </>
          )}

          {mode === 'test' && (
            <>
              <p className="text-sm text-neutral-500 mb-4">Play the sound, then guess</p>
              <button
                onClick={runTest}
                aria-label="Play the character's morse pattern"
                className="w-24 h-24 rounded-full border-2 border-signal bg-signal/10 flex items-center justify-center mb-6"
              >
                <Zap size={28} className="text-signal" />
              </button>
              <div className="grid grid-cols-4 gap-2 w-full">
                {lesson.chars.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleGuess(c)}
                    className={`py-2 rounded-md border text-sm font-medium transition-colors ${
                      feedback && c === targetChar
                        ? 'border-green-500 bg-green-500/10'
                        : feedback === 'wrong' && c === guess
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-line hover:border-neutral-600'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode !== 'learn' && (
            <>
              <div aria-live="polite" className="mt-4 min-h-[2rem] text-sm flex items-center gap-2">
                {feedback === 'correct' && <span className="text-green-400">Correct</span>}
                {feedback === 'wrong' && (
                  <>
                    <span className="text-red-400">Not quite, {targetChar} is</span>
                    <PatternBars pattern={targetPattern} />
                    <span className="sr-only">{speak(targetPattern)}</span>
                  </>
                )}
              </div>
              {roundResult && (
                <p
                  aria-live="polite"
                  className={`text-sm mt-2 text-center ${
                    roundResult.passed ? 'text-green-400' : 'text-neutral-300'
                  }`}
                >
                  Round done: {roundResult.correct} of {roundResult.total}.{' '}
                  {roundResult.passed
                    ? mode === 'practice' ? 'Practice round completed.' : 'Lesson passed.'
                    : `You need ${mode === 'practice' ? neededPractice(roundResult.total) : needed(roundResult.total, PASS_RATE)} to pass, go again.`}
                </p>
              )}
              <p className="text-xs text-neutral-500 mt-4">
                Character {index + 1} of {order.length} · Streak: {streak}
              </p>
            </>
          )}
        </div>

        {mode === 'practice' ? (
          <div>
            <p className="text-sm text-neutral-500 mb-1">Choose a practice group</p>
            <p className="text-xs text-neutral-600 mb-3">
              Practice one type of Morse code at a time. Each round uses only the selected group.
            </p>
            <div className="flex flex-col gap-2">
              <div className={`rounded-lg border p-3 ${practiceCategory === 'Letters' ? 'border-signal bg-signal/5' : 'border-line'}`}>
                <button
                  type="button"
                  onClick={() => selectPracticeCategory('Letters')}
                  aria-pressed={practiceCategory === 'Letters'}
                  className="w-full flex items-center justify-between gap-3 text-sm text-left"
                >
                  <span className="font-medium">Letters</span>
                  <span className="text-xs text-neutral-500">A–Z · 4 sections</span>
                </button>
                <div className="flex flex-col gap-2 mt-3">
                  {LESSONS.filter((item) => item.id <= 4).map((section, index) => {
                    const isLocked = index > 0 && !completedPracticeLetterSections.includes(LESSONS[index - 1].id)
                    const isDone = completedPracticeLetterSections.includes(section.id)
                    const isActive = practiceCategory === 'Letters' && practiceLetterSectionId === section.id
                    return (
                      <button
                        key={section.id}
                        type="button"
                        disabled={isLocked}
                        onClick={() => selectPracticeLetterSection(section.id)}
                        aria-pressed={isActive}
                        className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs text-left ${
                          isActive ? 'border-signal text-signal' : 'border-line'
                        } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-neutral-600'}`}
                      >
                        <span className="flex items-center gap-2">
                          {isDone ? <Check size={13} className="text-green-400" /> : isLocked ? <Lock size={13} /> : null}
                          {section.label}
                        </span>
                        <span className="text-neutral-500">{isDone ? 'Completed' : isLocked ? 'Locked' : '90% to unlock next'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {[
                { label: 'Numbers', group: 'Numbers' },
                { label: 'Special characters', group: 'Symbols' },
                { label: 'Punctuation', group: 'Punctuation' },
              ].map(({ label, group }) => {
                const chars = REFERENCE_GROUPS.find((item) => item.label === group)?.chars ?? []
                const isActive = practiceCategory === label
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => selectPracticeCategory(label)}
                    aria-pressed={isActive}
                    className={`flex items-center justify-between gap-3 px-3 py-3 rounded-lg border text-sm text-left transition-colors ${
                      isActive ? 'border-signal bg-signal/5' : 'border-line hover:border-neutral-600'
                    }`}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-neutral-500">{chars.length} characters</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-neutral-500 mt-4">
              Score at least 90% in a letter section to unlock the next one. Numbers, symbols, and punctuation remain available independently.
            </p>
          </div>
        ) : mode === 'test' ? (
          <div>
            <p className="text-sm text-neutral-500 mb-1">Lessons</p>
            <p className="text-xs text-neutral-600 mb-3">
              Score {Math.round(PASS_RATE * 100)}% in a round to unlock the next one
            </p>
            <div className="flex flex-col gap-2">
              {LESSONS.map((l, idx) => {
                const isLocked = idx > 0 && !completed.includes(LESSONS[idx - 1].id)
                const isDone = completed.includes(l.id)
                const isActive = l.id === lessonId
                return (
                  <button
                    key={l.id}
                    disabled={isLocked}
                    onClick={() => selectLesson(l.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      isActive ? 'border-signal' : 'border-line'
                    } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-neutral-600'}`}
                  >
                    {isDone ? (
                      <Check size={14} className="text-green-400" />
                    ) : isLocked ? (
                      <Lock size={14} className="text-neutral-500" />
                    ) : (
                      <Zap size={14} className="text-signal" />
                    )}
                    <span className={isLocked ? 'text-neutral-500' : ''}>{l.label}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={clearProgress}
              className="flex items-center gap-2 text-xs text-neutral-500 hover:text-red-400 transition-colors mt-4"
            >
              <Trash2 size={13} /> Clear progress
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
