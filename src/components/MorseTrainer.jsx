import { useState, useRef, useEffect } from 'react'
import { MORSE, GROUPS, STAGES, REFERENCE_GROUPS } from '../data/morseCode.js'
import { shuffle, buildSequence, updateWeak, MAX_WEAK_SCORE } from '../lib/rounds.js'
import { timing, clampWpm, WPM_MIN, WPM_MAX, WPM_DEFAULT } from '../lib/timing.js'
import { Check, Lock, Zap, Trash2, Eraser } from 'lucide-react'

const RAMP_S = 0.01
const PASS_RATE = 0.75
const PRACTICE_PASS_RATE = 0.9
const ROUND_LENGTH = 10
const CORRECT_DELAY_MS = 700
const WRONG_DELAY_MS = 1500
// v2 keys store stage ids like "letters-1". The old keys used different ids, so they are cleared on reset.
const PROGRESS_KEY = 'a4o-morse-progress-v2'
const PRACTICE_PROGRESS_KEY = 'a4o-morse-practice-progress-v2'
// Per-character trouble scores, shared by Practice and Test. The old key counted test misses forever and never faded.
const WEAK_KEY = 'a4o-morse-weak-v2'
const WPM_KEY = 'a4o-morse-wpm-v1' // a setting, not progress, so Reset leaves it alone
const LEGACY_KEYS = [
  'a4o-morse-test-weak-characters',
  'a4o-morse-progress',
  'a4o-morse-practice-letter-progress',
  'a4o-morse-practice-group-progress',
]
const TEST_LENGTH = 15
const TEST_REPLAYS = 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// The epsilon keeps float noise (0.9 * 10 = 9.000000000000002 in some engines) from bumping the pass mark up.
const needed = (total, rate = PASS_RATE) => Math.ceil(rate * total - 1e-9)
const roundLength = (chars) => Math.max(ROUND_LENGTH, chars.length)
const makeRound = (chars, weak) => buildSequence(chars, roundLength(chars), weak)
const speak = (pattern) => [...pattern].map((s) => (s === '.' ? 'dot' : 'dash')).join(' ')

const STAGE_IDS = new Set(STAGES.map((s) => s.id))

function loadIds(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key))
    return Array.isArray(saved) ? saved.filter((id) => STAGE_IDS.has(id)) : []
  } catch {
    return []
  }
}

function loadWpm() {
  try {
    const saved = localStorage.getItem(WPM_KEY)
    return saved === null ? WPM_DEFAULT : clampWpm(saved)
  } catch {
    return WPM_DEFAULT
  }
}

function loadWeak() {
  try {
    const saved = JSON.parse(localStorage.getItem(WEAK_KEY))
    if (!saved || typeof saved !== 'object') return {}
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([char, score]) => char in MORSE && Number.isFinite(score) && score > 0 && score <= MAX_WEAK_SCORE
      )
    )
  } catch {
    return {}
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be blocked or full (private mode). Progress just won't persist.
  }
}

function BufferRow({ buffer, onClear, disabled }) {
  return (
    <div className="flex flex-col items-center gap-2 mt-4">
      <div className="flex gap-1 h-5" role="img" aria-label={buffer.length ? `Keyed so far: ${speak(buffer.join(''))}` : undefined}>
        {buffer.map((s, i) => (
          <span key={i} className={`bg-signal rounded-sm h-5 ${s === '.' ? 'w-2' : 'w-5'}`} />
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled || buffer.length === 0}
        title="Backspace"
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200 transition-colors disabled:opacity-30 disabled:hover:text-neutral-500"
      >
        <Eraser size={13} /> Clear
      </button>
    </div>
  )
}

function createTestQuestions(chars, weak) {
  const types = shuffle([
    ...Array(5).fill('visual'),
    ...Array(5).fill('recall'),
    ...Array(5).fill('listening'),
  ])
  const sequence = buildSequence(chars, types.length, weak)
  return types.map((type, i) => {
    const char = sequence[i]
    const distractors = shuffle(chars.filter((item) => item !== char)).slice(0, 3)
    return {
      type,
      char,
      options: shuffle([char, ...distractors]),
    }
  })
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

// Learn mode viewer: the selected character as big dots and dashes with its memory phrase underneath.
// While audio plays, activeIndex is the signal being sounded (-1 when idle) and the rest light up as they go.
function PatternViewer({ char, activeIndex, onPlay }) {
  const pattern = MORSE[char]
  const phrase = MNEMONICS[char] || []
  const symbols = [...pattern]
  const hasPhrase = phrase.length === symbols.length
  const playing = activeIndex >= 0

  return (
    <aside
      aria-label={`${char} mnemonic and Morse code`}
      className="order-last lg:order-none self-start lg:sticky lg:top-6 bg-panel border border-line rounded-xl p-4 lg:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-4xl leading-none text-neutral-100">{char}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-100">Remember the rhythm</p>
            <p className="text-xs text-neutral-500">Lowercase = dot · CAPS = dash</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play ${char}`}
          className="shrink-0 inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-signal/60 text-signal hover:bg-signal/10 transition-colors"
        >
          <Zap size={13} /> Play
        </button>
      </div>

      {hasPhrase ? (
        <ol aria-label={`${char}: ${speak(pattern)}`} className="grid grid-flow-col auto-cols-fr gap-2 mt-4">
          {symbols.map((symbol, i) => {
            const lit = !playing || i <= activeIndex
            const current = playing && i === activeIndex
            const isDash = symbol === '-'
            return (
              <li key={i} className={`min-w-0 rounded-lg border p-2 text-center transition-colors ${
                current ? 'border-signal bg-signal/10' : 'border-line bg-ink/30'
              } ${lit ? '' : 'opacity-40'}`}>
                <span className="block text-xs text-neutral-500 truncate mb-2">{phrase[i]}</span>
                <span
                  aria-label={isDash ? 'dash' : 'dot'}
                  className={`mx-auto block bg-signal transition-all duration-150 motion-reduce:transition-none ${
                    isDash ? 'w-8 h-2 rounded-sm' : 'w-2 h-2 rounded-full'
                  } ${current ? 'scale-125' : ''}`}
                />
                <span className="block text-[10px] uppercase tracking-wider text-neutral-600 mt-2">
                  {isDash ? 'Dash' : 'Dot'}
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-ink/30 p-3">
          <PatternBars pattern={pattern} />
          <span className="text-xs text-neutral-500">No mnemonic phrase for this character</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-line">
        <span className="text-xs text-neutral-500">Morse pattern</span>
        <span className="font-mono text-sm tracking-[0.2em] text-signal">{pattern}</span>
      </div>
    </aside>
  )
}

function useBeep(speed) {
  const speedRef = useRef(speed)
  speedRef.current = speed
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
  // onSymbol(i) fires as each signal starts. Resolves true if the pattern played to the end, false if it was cut off.
  const playPattern = async (pattern, onSymbol) => {
    const token = ++playToken.current
    const { dot, dash, symbolGap } = speedRef.current
    let i = 0
    for (const symbol of pattern) {
      if (token !== playToken.current) return false
      onSymbol?.(i++)
      start()
      await sleep(symbol === '.' ? dot : dash)
      if (token !== playToken.current) return false
      stop()
      await sleep(symbolGap)
    }
    return true
  }

  return { start, stop, playPattern, cancel }
}

export default function MorseTrainer() {
  const [completed, setCompleted] = useState(() => loadIds(PROGRESS_KEY))
  const [completedPractice, setCompletedPractice] = useState(() => loadIds(PRACTICE_PROGRESS_KEY))
  const [lessonId, setLessonId] = useState(STAGES[0].id)
  const [practiceStageId, setPracticeStageId] = useState(STAGES[0].id)
  const [mode, setMode] = useState(() => (completed.length || completedPractice.length ? 'practice' : 'learn'))
  const [order, setOrder] = useState(() => makeRound(STAGES[0].chars, loadWeak()))
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [buffer, setBuffer] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [guess, setGuess] = useState(null)
  const [roundResult, setRoundResult] = useState(null)
  const [streak, setStreak] = useState(0)
  const [testQuestions, setTestQuestions] = useState([])
  const [testIndex, setTestIndex] = useState(0)
  const [testAnswers, setTestAnswers] = useState([])
  const [testReplayCount, setTestReplayCount] = useState(0)
  const [testComplete, setTestComplete] = useState(false)
  const [weakCharacters, setWeakCharacters] = useState(loadWeak)
  const [learnCategory, setLearnCategory] = useState('All')
  const [wpm, setWpm] = useState(loadWpm)

  // Mirrors weakCharacters so timeouts that fire after an answer still see the latest scores.
  const weakRef = useRef(weakCharacters)
  const pressStart = useRef(null)
  const gapTimer = useRef(null)
  const feedbackTimer = useRef(null)
  const speed = timing(wpm)
  const { start, stop, playPattern, cancel } = useBeep(speed)

  const lesson = STAGES.find((s) => s.id === lessonId)
  const targetChar = order[index]
  const targetPattern = MORSE[targetChar]
  const testQuestion = testQuestions[testIndex]
  const testTargetPattern = testQuestion ? MORSE[testQuestion.char] : ''
  const practiceStage = STAGES.find((s) => s.id === practiceStageId)
  const practiceChars = practiceStage.chars
  // A practice stage opens once the previous stage of the same group has been passed.
  const isPracticeLocked = (stage) =>
    stage.number > 1 && !completedPractice.includes(`${stage.groupId}-${stage.number - 1}`)
  const activeChars = mode === 'practice' ? practiceChars : lesson.chars
  const visibleReferenceGroups = learnCategory === 'All'
    ? REFERENCE_GROUPS
    : REFERENCE_GROUPS.filter((group) => group.label === learnCategory)
  const visibleCharacterCount = visibleReferenceGroups.reduce((total, group) => total + group.chars.length, 0)
  // If the selected character is filtered out, the viewer falls back to the first visible one.
  const visibleChars = visibleReferenceGroups.flatMap((group) => group.chars)
  const learnChar = visibleChars.includes(learnSelected) ? learnSelected : visibleChars[0]

  useEffect(() => saveJson(PROGRESS_KEY, completed), [completed])
  useEffect(() => saveJson(PRACTICE_PROGRESS_KEY, completedPractice), [completedPractice])
  useEffect(() => saveJson(WEAK_KEY, weakCharacters), [weakCharacters])
  useEffect(() => saveJson(WPM_KEY, wpm), [wpm])

  // Spacebar keys Morse in Practice and during Test recall questions only.
  useEffect(() => {
    const testRecallActive = mode === 'test' && testQuestion?.type === 'recall' && !testComplete
    if (mode !== 'practice' && !testRecallActive) return
    const onKeyDown = (e) => {
      if (e.code === 'Backspace') {
        e.preventDefault()
        clearInput()
        return
      }
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

  const recordResult = (char, wasCorrect) => {
    const next = updateWeak(weakRef.current, char, wasCorrect)
    weakRef.current = next
    setWeakCharacters(next)
  }

  // Wipes a half-keyed answer so one stray tap doesn't cost a whole prompt.
  const clearInput = () => {
    if (feedback) return
    clearTimeout(gapTimer.current)
    gapTimer.current = null
    if (pressStart.current !== null) {
      pressStart.current = null
      stop()
    }
    setBuffer([])
  }

  // Throws away anything in flight (timers, sounds, half-sent letters) and starts a fresh shuffled round.
  const resetRound = (chars) => {
    clearTimers()
    cancel()
    pressStart.current = null
    setOrder(makeRound(chars, weakRef.current))
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
    recordResult(targetChar, wasCorrect)
    const newCorrect = correct + (wasCorrect ? 1 : 0)
    setCorrect(newCorrect)

    feedbackTimer.current = setTimeout(
      () => {
        setFeedback(null)
        setGuess(null)
        setBuffer([])
        if (index + 1 >= order.length) {
          const passed = newCorrect >= needed(order.length, PRACTICE_PASS_RATE)
          setRoundResult({ correct: newCorrect, total: order.length, passed })
          if (passed) {
            setCompletedPractice((ids) => (ids.includes(practiceStageId) ? ids : [...ids, practiceStageId]))
          }
          setOrder(makeRound(activeChars, weakRef.current))
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
    const isTestRecall = mode === 'test' && testQuestion?.type === 'recall' && !testComplete
    if (feedback || (mode !== 'practice' && !isTestRecall)) return
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
    const symbol = duration < speed.dashThreshold ? '.' : '-'
    const next = [...buffer, symbol]
    setBuffer(next)
    clearTimeout(gapTimer.current)
    gapTimer.current = setTimeout(() => {
      if (mode === 'test') submitTestAnswer(next.join(''))
      else advance(next.join('') === targetPattern)
    }, speed.letterGap)
  }

  const startTest = (chars) => {
    clearTimers()
    cancel()
    const questions = createTestQuestions(chars, weakRef.current)
    setTestQuestions(questions)
    setTestIndex(0)
    setTestAnswers([])
    setTestReplayCount(0)
    setTestComplete(false)
    setFeedback(null)
    setGuess(null)
    setBuffer([])
    setRoundResult(null)
    setStreak(0)
  }

  const submitTestAnswer = (answer) => {
    if (feedback || testComplete || !testQuestion) return
    const isCorrect = testQuestion.type === 'recall'
      ? answer === testTargetPattern
      : answer === testQuestion.char
    const record = {
      char: testQuestion.char,
      type: testQuestion.type,
      answer,
      correct: isCorrect,
    }
    const answers = [...testAnswers, record]
    setTestAnswers(answers)
    recordResult(testQuestion.char, isCorrect)
    setFeedback(isCorrect ? 'correct' : 'wrong')
    setStreak((value) => isCorrect ? value + 1 : 0)
    feedbackTimer.current = setTimeout(() => {
      setFeedback(null)
      setGuess(null)
      setBuffer([])
      setTestReplayCount(0)
      if (testIndex + 1 >= testQuestions.length) {
        const score = answers.filter((item) => item.correct).length
        const passed = score >= needed(TEST_LENGTH, PASS_RATE)
        setTestComplete(true)
        setRoundResult({ correct: score, total: TEST_LENGTH, passed })
        if (passed) setCompleted((items) => items.includes(lessonId) ? items : [...items, lessonId])
      } else {
        setTestIndex((value) => value + 1)
      }
    }, 650)
  }

  const runTest = async () => {
    if (feedback || testComplete || !testQuestion || testReplayCount >= TEST_REPLAYS) return
    setTestReplayCount((value) => value + 1)
    await playPattern(testTargetPattern)
  }

  const handleGuess = (letter) => {
    if (feedback || testComplete) return
    setGuess(letter)
    submitTestAnswer(letter)
  }

  // Selects a character in Learn mode, plays it, and lights up each signal as it sounds.
  const playLearn = async (c) => {
    setLearnSelected(c)
    const finished = await playPattern(MORSE[c], setLearnActive)
    if (finished) setLearnActive(-1)
  }

  const changeMode = (m) => {
    if (m === mode) return
    setMode(m)
    setLearnActive(-1)
    if (m === 'test') startTest(lesson.chars)
    else resetRound(m === 'practice' ? practiceChars : lesson.chars)
  }

  const selectPracticeStage = (id) => {
    const stage = STAGES.find((s) => s.id === id)
    if (!stage || isPracticeLocked(stage)) return
    setPracticeStageId(id)
    resetRound(stage.chars)
  }

  const selectPracticeGroup = (groupId) => {
    if (practiceStage.groupId === groupId) return
    selectPracticeStage(`${groupId}-1`)
  }

  const selectLesson = (id) => {
    setLessonId(id)
    const chars = STAGES.find((s) => s.id === id).chars
    if (mode === 'test') startTest(chars)
    else resetRound(chars)
  }

  const restartTest = () => startTest(lesson.chars)

  const clearProgress = () => {
    const ok = window.confirm("Reset all lesson and practice progress? This can't be undone.")
    if (!ok) return
    ;[PROGRESS_KEY, PRACTICE_PROGRESS_KEY, WEAK_KEY, ...LEGACY_KEYS].forEach((key) => {
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore blocked storage
      }
    })
    setCompleted([])
    setCompletedPractice([])
    weakRef.current = {}
    setWeakCharacters({})
    setLessonId(STAGES[0].id)
    setPracticeStageId(STAGES[0].id)
    if (mode === 'test') startTest(STAGES[0].chars)
    else resetRound(STAGES[0].chars)
    setStreak(0)
  }

  const subtitle = {
    learn: 'See each pattern and hear how it sounds',
    practice: 'Hold the button or spacebar to key',
    test: 'Identify patterns, listen, and send Morse code'
  }[mode]

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-medium">{mode === 'learn' ? 'All characters' : mode === 'practice' ? `Practice: ${practiceStage.label}` : lesson.label}</p>
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

      <div className="flex items-center gap-3 flex-wrap mb-6 text-sm">
        <label htmlFor="wpm" className="text-neutral-400">Speed</label>
        <input
          id="wpm"
          type="range"
          min={WPM_MIN}
          max={WPM_MAX}
          step={1}
          value={wpm}
          onChange={(e) => setWpm(clampWpm(e.target.value))}
          aria-valuetext={`${wpm} words per minute`}
          className="w-40 accent-signal"
        />
        <span className="font-medium tabular-nums w-16">{wpm} WPM</span>
        <span className="text-xs text-neutral-500">
          Dot {Math.round(speed.dot)}ms · dash over {Math.round(speed.dashThreshold)}ms when keying
        </span>
      </div>

      <div className={`grid grid-cols-1 gap-5 ${mode === 'learn' ? 'lg:grid-cols-[1fr_320px]' : 'md:grid-cols-[1.3fr_1fr]'}`}>
        <div className="bg-panel border border-line rounded-xl p-8 flex flex-col items-center">
          {mode === 'learn' && (
            <>
              <div className="w-full mb-5">
                <p className="text-sm text-neutral-500 mb-3">
                  Select any character to hear it and see its dots and dashes. For letters, say the
                  memory phrase out loud: CAPS syllables are dashes, quiet ones are dots.
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
                <div className="mt-4 rounded-lg border border-line bg-ink/30 p-3">
                  <button
                    type="button"
                    onClick={() => setShowMnemonicGuide((open) => !open)}
                    aria-expanded={showMnemonicGuide}
                    aria-controls="letter-mnemonic-guide"
                    className="w-full flex items-center justify-between gap-3 text-sm text-left"
                  >
                    <span>
                      <span className="font-medium text-neutral-200">Visualise the dots & dashes</span>
                      <span className="block text-xs text-neutral-500 mt-0.5">Use letter mnemonics to remember each Morse pattern</span>
                    </span>
                    <span className="text-signal text-xs whitespace-nowrap">{showMnemonicGuide ? 'Hide guide −' : 'Show guide +'}</span>
                  </button>
                  {showMnemonicGuide && (
                    <div id="letter-mnemonic-guide" className="mt-3 pt-3 border-t border-line">
                      <div className="flex items-center gap-3 flex-wrap">
                        <label htmlFor="mnemonic-letter" className="text-xs text-neutral-400">Choose a letter</label>
                        <select
                          id="mnemonic-letter"
                          value={mnemonicLetter}
                          onChange={(e) => setMnemonicLetter(e.target.value)}
                          className="bg-panel border border-line rounded-md px-2 py-1.5 text-sm text-neutral-100"
                        >
                          {Object.keys(LETTER_MNEMONICS).map((letter) => (
                            <option key={letter} value={letter}>{letter}</option>
                          ))}
                        </select>
                        <span className="text-xs text-neutral-500">UPPERCASE = dash · lowercase = dot</span>
                      </div>
                      <div className="mt-3 rounded-md bg-panel border border-line p-3">
                        <p className="text-xs text-neutral-500 mb-2">Say the mnemonic and follow its rhythm</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {LETTER_MNEMONICS[mnemonicLetter].split(/\\s*-\\s*/).map((syllable, index) => {
                            const isDash = syllable === syllable.toUpperCase()
                            return (
                              <div key={index} className="flex flex-col items-center gap-1 min-w-10">
                                <span className="text-sm font-semibold text-neutral-200">{syllable}</span>
                                <span
                                  aria-label={isDash ? 'dash' : 'dot'}
                                  className={`block rounded-sm bg-signal ${isDash ? 'w-6 h-2' : 'w-2 h-2 rounded-full'}`}
                                />
                              </div>
                            )
                          })}
                        </div>
                        <p className="text-xs text-neutral-400 mt-3">
                          {mnemonicLetter} = <span className="font-mono text-signal tracking-widest">{MORSE[mnemonicLetter]}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
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
                          onClick={() => playLearn(c)}
                          aria-label={`${c}, ${speak(MORSE[c])}. Play sound`}
                          aria-pressed={learnChar === c}
                          className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors ${
                            learnChar === c
                              ? 'border-signal bg-signal/10'
                              : 'border-line hover:border-signal hover:bg-signal/5'
                          }`}
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
              <p className="text-xs text-neutral-500 mt-4">Tap for a dot, hold for a dash. Backspace clears.</p>
              <BufferRow buffer={buffer} onClear={clearInput} disabled={!!feedback} />
            </>
          )}

          {mode === 'test' && (
            <>
              {!testComplete && testQuestion ? (
                <>
                  <div className="w-full flex items-center justify-between mb-4">
                    <span className="text-sm text-neutral-400">Question {testIndex + 1} of {TEST_LENGTH}</span>
                    <span className="text-xs text-signal uppercase tracking-wide">
                      {testQuestion.type === 'visual' ? 'Visual recognition' : testQuestion.type === 'recall' ? 'Morse recall' : 'Listening'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-ink mb-6 overflow-hidden">
                    <div className="h-full bg-signal transition-all" style={{ width: `${(testIndex / TEST_LENGTH) * 100}%` }} />
                  </div>
                  {testQuestion.type === 'visual' && (
                    <>
                      <p className="text-sm text-neutral-400 mb-5">Which character matches this Morse pattern?</p>
                      <div className="min-h-12 flex items-center justify-center mb-6">
                        <PatternBars pattern={testTargetPattern} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                        {testQuestion.options.map((c) => (
                          <button key={c} onClick={() => handleGuess(c)} disabled={!!feedback} className="py-3 rounded-md border border-line hover:border-signal text-lg font-medium disabled:opacity-60">{c}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {testQuestion.type === 'listening' && (
                    <>
                      <p className="text-sm text-neutral-400 mb-5">Listen carefully. Which character did you hear?</p>
                      <button onClick={runTest} disabled={!!feedback || testReplayCount >= TEST_REPLAYS} aria-label="Play Morse audio" className="w-24 h-24 rounded-full border-2 border-signal bg-signal/10 flex items-center justify-center mb-3 disabled:opacity-50">
                        <Zap size={28} className="text-signal" />
                      </button>
                      <p className="text-xs text-neutral-500 mb-5">Audio plays used: {testReplayCount}/{TEST_REPLAYS}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                        {testQuestion.options.map((c) => (
                          <button key={c} onClick={() => handleGuess(c)} disabled={!!feedback} className="py-3 rounded-md border border-line hover:border-signal text-lg font-medium disabled:opacity-60">{c}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {testQuestion.type === 'recall' && (
                    <>
                      <p className="text-sm text-neutral-400 mb-2">Send the Morse code for this character.</p>
                      <p className="font-display text-5xl mb-6">{testQuestion.char}</p>
                      <button
                        onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture?.(e.pointerId); handleDown() }}
                        onPointerUp={handleUp}
                        onPointerCancel={handleUp}
                        onContextMenu={(e) => e.preventDefault()}
                        aria-label="Key a dot or dash for the test answer"
                        className="w-24 h-24 rounded-full border-2 border-signal bg-signal/10 flex items-center justify-center select-none touch-none"
                      >
                        <Zap size={28} className="text-signal" />
                      </button>
                      <p className="text-xs text-neutral-500 mt-3">Tap for a dot, hold for a dash. Code submits after a short pause, Backspace clears.</p>
                      <BufferRow buffer={buffer} onClear={clearInput} disabled={!!feedback} />
                    </>
                  )}
                </>
              ) : (
                <div className="w-full">
                  <h3 className="text-xl font-semibold text-center mb-2">Assessment complete</h3>
                  <p className="text-center text-3xl font-semibold mb-1">{testAnswers.filter((item) => item.correct).length}/{TEST_LENGTH}</p>
                  <p className="text-sm text-center text-neutral-400 mb-5">{roundResult?.passed ? 'Passed — lesson unlocked.' : `You need ${needed(TEST_LENGTH, PASS_RATE)} correct to pass.`}</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {testAnswers.map((item, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm border-b border-line pb-2">
                        <span>{i + 1}. {item.char} <span className="text-xs text-neutral-500">({item.type === 'visual' ? 'Visual' : item.type === 'recall' ? 'Recall' : 'Listening'})</span></span>
                        <span className={item.correct ? 'text-green-400' : 'text-red-400'}>{item.correct ? 'Correct' : `Correct code: ${MORSE[item.char]}`}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={restartTest} className="w-full mt-5 py-3 rounded-lg border border-signal text-signal hover:bg-signal/10">Try another test</button>
                </div>
              )}
            </>
          )}

          {mode !== 'learn' && (
            <>
              <div aria-live="polite" className="mt-4 min-h-[2rem] text-sm flex items-center gap-2">
                {feedback === 'correct' && <span className="text-green-400">Correct</span>}
                {feedback === 'wrong' && (
                  mode === 'test'
                    ? <span className="text-neutral-400">Answer recorded. Keep going.</span>
                    : <>
                        <span className="text-red-400">Not quite, {targetChar} is</span>
                        <PatternBars pattern={targetPattern} />
                        <span className="sr-only">{speak(targetPattern)}</span>
                      </>
                )}
              </div>
              {roundResult && mode !== 'test' && (
                <p
                  aria-live="polite"
                  className={`text-sm mt-2 text-center ${
                    roundResult.passed ? 'text-green-400' : 'text-neutral-300'
                  }`}
                >
                  Round done: {roundResult.correct} of {roundResult.total}.{' '}
                  {roundResult.passed
                    ? 'Stage passed.'
                    : `You need ${needed(roundResult.total, PRACTICE_PASS_RATE)} to pass, go again.`}
                </p>
              )}
              {mode !== 'test' && <p className="text-xs text-neutral-500 mt-4">Character {index + 1} of {order.length} · Streak: {streak}</p>}
              {mode === 'test' && !testComplete && <p className="text-xs text-neutral-500 mt-4">Current streak: {streak}</p>}
              {mode === 'test' && testComplete && Object.keys(weakCharacters).length > 0 && (
                <div className="mt-4 w-full text-left">
                  <p className="text-xs text-neutral-400 mb-2">Characters to review</p>
                  <p className="text-xs text-neutral-500">{Object.entries(weakCharacters).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([char]) => char).join(' · ')}</p>
                </div>
              )}
            </>
          )}
        </div>

        {mode === 'learn' && (
          <PatternViewer char={learnChar} activeIndex={learnActive} onPlay={() => playLearn(learnChar)} />
        )}

        {mode === 'practice' ? (
          <div>
            <p className="text-sm text-neutral-500 mb-1">Choose a practice group</p>
            <p className="text-xs text-neutral-600 mb-3">
              Practice one type of Morse code at a time. Each round uses only the selected stage.
            </p>
            <div className="flex flex-col gap-2">
              {GROUPS.map((group) => {
                const isActive = practiceStage.groupId === group.id
                const groupStages = STAGES.filter((s) => s.groupId === group.id)
                const charCount = groupStages.reduce((n, s) => n + s.chars.length, 0)
                return (
                  <div key={group.id} className={`rounded-lg border p-3 ${isActive ? 'border-signal bg-signal/5' : 'border-line'}`}>
                    <button
                      type="button"
                      onClick={() => selectPracticeGroup(group.id)}
                      aria-pressed={isActive}
                      className="w-full flex items-center justify-between gap-3 text-sm text-left"
                    >
                      <span className="font-medium">{group.label}</span>
                      <span className="text-xs text-neutral-500">{charCount} characters · {groupStages.length} stages</span>
                    </button>
                    {isActive && (
                      <div className="flex flex-col gap-2 mt-3">
                        {groupStages.map((stage) => {
                          const isLocked = isPracticeLocked(stage)
                          const isDone = completedPractice.includes(stage.id)
                          const isSelected = practiceStageId === stage.id
                          const total = roundLength(stage.chars)
                          return (
                            <button
                              key={stage.id}
                              type="button"
                              disabled={isLocked}
                              onClick={() => selectPracticeStage(stage.id)}
                              aria-pressed={isSelected}
                              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs text-left ${
                                isSelected ? 'border-signal text-signal' : 'border-line'
                              } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-neutral-600'}`}
                            >
                              <span className="flex items-center gap-2">
                                {isDone ? <Check size={13} className="text-green-400" /> : isLocked ? <Lock size={13} /> : null}
                                {stage.part} · {stage.chars.join(' ')}
                              </span>
                              <span className="text-neutral-500">
                                {isDone ? 'Completed' : isLocked ? 'Locked' : `Pass: ${needed(total, PRACTICE_PASS_RATE)}/${total}`}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-neutral-500 mt-4">
              Each round is {ROUND_LENGTH} prompts or one per character, whichever is more. Score {Math.round(PRACTICE_PASS_RATE * 100)}% to unlock the next stage in the group.
            </p>
            {Object.keys(weakCharacters).length > 0 && (
              <p className="text-xs text-neutral-400 mt-3">
                Needs work: {Object.entries(weakCharacters).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([char]) => char).join(' · ')}.
                {' '}These come up more often in your rounds until you get them right.
              </p>
            )}
            <button
              onClick={clearProgress}
              className="flex items-center gap-2 text-xs text-neutral-500 hover:text-red-400 transition-colors mt-4"
            >
              <Trash2 size={13} /> Reset progress
            </button>
          </div>
        ) : mode === 'test' ? (
          <div>
            <div className="mb-4">
              <p className="text-sm font-semibold text-neutral-200 mb-1">Assessment centre</p>
              <p className="text-xs text-neutral-500">
                Choose a lesson to test your Morse-code knowledge. Score {Math.round(PASS_RATE * 100)}% to unlock the next lesson.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {STAGES.map((l, idx) => {
                const isLocked = idx > 0 && !completed.includes(STAGES[idx - 1].id)
                const isDone = completed.includes(l.id)
                const isActive = l.id === lessonId
                const status = isDone ? 'Passed' : isLocked ? 'Locked' : isActive ? 'Ready to test' : 'Available'
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={isLocked}
                    onClick={() => selectLesson(l.id)}
                    aria-pressed={isActive}
                    className={`group rounded-xl border p-4 text-left transition-all ${
                      isActive
                        ? 'border-signal bg-signal/10 shadow-sm'
                        : isLocked
                        ? 'border-line bg-panel/70 cursor-not-allowed'
                        : 'border-line bg-panel hover:border-signal/60 hover:bg-signal/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <span className="text-xs uppercase tracking-wider text-neutral-500">Lesson {idx + 1}</span>
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400"><Check size={13} /> Passed</span>
                      ) : isLocked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-500"><Lock size={13} /> Locked</span>
                      ) : isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-signal"><Zap size={13} /> Ready</span>
                      ) : (
                        <span className="text-xs text-neutral-500">Available</span>
                      )}
                    </div>
                    <p className={`font-semibold text-sm mb-1 ${isLocked ? 'text-neutral-300' : 'text-neutral-100'}`}>{l.label}</p>
                    <p className="text-xs text-neutral-500">
                      {l.chars.join(' ')} · {TEST_LENGTH} questions
                    </p>
                    <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                      <span className="text-xs text-neutral-500">{isDone ? 'Assessment passed' : isLocked ? 'Pass previous lesson first' : 'Mixed assessment'}</span>
                      {!isLocked && <span className="text-xs font-medium text-signal">{isActive ? 'Selected' : 'Open'} →</span>}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 rounded-lg border border-line bg-ink/40 p-3">
              <p className="text-xs font-medium text-neutral-300 mb-1">Assessment format</p>
              <p className="text-xs text-neutral-500">Each test contains visual recognition, Morse recall and listening questions. Your score and corrections appear at the end.</p>
            </div>
            <button
              onClick={clearProgress}
              className="flex items-center gap-2 text-xs text-neutral-500 hover:text-red-400 transition-colors mt-4"
            >
              <Trash2 size={13} /> Reset progress
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}