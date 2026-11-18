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
const PRACTICE_GROUP_PROGRESS_KEY = 'a4o-morse-practice-group-progress'
const CORRECT_DELAY_MS = 700
const WRONG_DELAY_MS = 1500
const PROGRESS_KEY = 'a4o-morse-progress'
const TEST_WEAK_KEY = 'a4o-morse-test-weak-characters'
const TEST_LENGTH = 15
const TEST_REPLAYS = 2

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

function createTestQuestions(chars) {
  const types = shuffle([
    ...Array(5).fill('visual'),
    ...Array(5).fill('recall'),
    ...Array(5).fill('listening'),
  ])
  return types.map((type) => {
    const char = chars[Math.floor(Math.random() * chars.length)]
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
  const [testQuestions, setTestQuestions] = useState([])
  const [testIndex, setTestIndex] = useState(0)
  const [testAnswers, setTestAnswers] = useState([])
  const [testReplayCount, setTestReplayCount] = useState(0)
  const [testComplete, setTestComplete] = useState(false)
  const [testWeakCharacters, setTestWeakCharacters] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TEST_WEAK_KEY)) || {}
    } catch {
      return {}
    }
  })
  const [learnCategory, setLearnCategory] = useState('All')
  const [practiceCategory, setPracticeCategory] = useState('Letters')
  const [practiceLetterSectionId, setPracticeLetterSectionId] = useState(1)
  const [practiceGroupStage, setPracticeGroupStage] = useState(1)
  const [completedPracticeGroupStages, setCompletedPracticeGroupStages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PRACTICE_GROUP_PROGRESS_KEY)) || []
    } catch {
      return []
    }
  })
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
  const testQuestion = testQuestions[testIndex]
  const testTargetPattern = testQuestion ? MORSE[testQuestion.char] : ''
  const practiceGroupLabel = practiceCategory === 'Special characters' ? 'Symbols' : practiceCategory
  const practiceLetterSection = LESSONS.find((item) => item.id === practiceLetterSectionId)
  const selectedPracticeGroup = REFERENCE_GROUPS.find((group) => group.label === practiceGroupLabel)
  const practiceGroupStages = selectedPracticeGroup
    ? [selectedPracticeGroup.chars.slice(0, selectedPracticeGroup.chars.length / 2), selectedPracticeGroup.chars.slice(selectedPracticeGroup.chars.length / 2)]
    : []
  const practiceChars = practiceCategory === 'Letters'
    ? practiceLetterSection.chars
    : practiceGroupStages[practiceGroupStage - 1] ?? []
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

  useEffect(() => {
    localStorage.setItem(PRACTICE_GROUP_PROGRESS_KEY, JSON.stringify(completedPracticeGroupStages))
  }, [completedPracticeGroupStages])

  useEffect(() => {
    localStorage.setItem(TEST_WEAK_KEY, JSON.stringify(testWeakCharacters))
  }, [testWeakCharacters])

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
          if (passed && mode === 'practice' && practiceCategory !== 'Letters') {
            const stageKey = `${practiceCategory}-${practiceGroupStage}`
            setCompletedPracticeGroupStages((stages) =>
              stages.includes(stageKey) ? stages : [...stages, stageKey]
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
    const symbol = duration < DASH_THRESHOLD_MS ? '.' : '-'
    const next = [...buffer, symbol]
    setBuffer(next)
    clearTimeout(gapTimer.current)
    gapTimer.current = setTimeout(() => {
      if (mode === 'test') submitTestAnswer(next.join(''))
      else advance(next.join('') === targetPattern)
    }, GAP_MS)
  }

  const startTest = (chars) => {
    clearTimers()
    cancel()
    const questions = createTestQuestions(chars)
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
        setTestWeakCharacters((previous) => {
          const next = { ...previous }
          answers.filter((item) => !item.correct).forEach((item) => {
            next[item.char] = (next[item.char] || 0) + 1
          })
          return next
        })
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

  const changeMode = (m) => {
    if (m === mode) return
    setMode(m)
    if (m === 'test') startTest(lesson.chars)
    else resetRound(m === 'practice' ? practiceChars : lesson.chars)
  }

  const selectPracticeCategory = (category) => {
    setPracticeCategory(category)
    if (category === 'Letters') {
      resetRound(practiceLetterSection.chars)
      return
    }
    setPracticeGroupStage(1)
    const groupLabel = category === 'Special characters' ? 'Symbols' : category
    const chars = REFERENCE_GROUPS.find((group) => group.label === groupLabel)?.chars ?? []
    resetRound(chars.slice(0, chars.length / 2))
  }

  const selectPracticeGroupStage = (stage) => {
    const stageKey = `${practiceCategory}-${stage - 1}`
    if (stage > 1 && !completedPracticeGroupStages.includes(stageKey)) return
    setPracticeGroupStage(stage)
    const groupLabel = practiceCategory === 'Special characters' ? 'Symbols' : practiceCategory
    const chars = REFERENCE_GROUPS.find((group) => group.label === groupLabel)?.chars ?? []
    const midpoint = chars.length / 2
    resetRound(stage === 1 ? chars.slice(0, midpoint) : chars.slice(midpoint))
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
    const chars = LESSONS.find((l) => l.id === id).chars
    if (mode === 'test') startTest(chars)
    else resetRound(chars)
  }

  const restartTest = () => startTest(lesson.chars)

  const clearProgress = () => {
    const ok = window.confirm("Reset all lesson and practice progress? This can't be undone.")
    if (!ok) return
    localStorage.removeItem(PROGRESS_KEY)
    localStorage.removeItem(PRACTICE_LETTER_PROGRESS_KEY)
    localStorage.removeItem(PRACTICE_GROUP_PROGRESS_KEY)
    setCompleted([])
    setCompletedPracticeLetterSections([])
    setCompletedPracticeGroupStages([])
    setLessonId(LESSONS[0].id)
    setPracticeLetterSectionId(1)
    setPracticeGroupStage(1)
    setPracticeCategory('Letters')
    resetRound(LESSONS[0].chars)
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
                      <p className="text-xs text-neutral-500 mt-3">Tap for a dot, hold for a dash. Code submits after a short pause.</p>
                      <div className="flex gap-1 mt-4 h-5">{buffer.map((symbol, i) => <span key={i} className={`bg-signal rounded-sm h-5 ${symbol === '.' ? 'w-2' : 'w-5'}`} />)}</div>
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
                    ? mode === 'practice' ? 'Practice round completed.' : 'Lesson passed.'
                    : `You need ${mode === 'practice' ? neededPractice(roundResult.total) : needed(roundResult.total, PASS_RATE)} to pass, go again.`}
                </p>
              )}
              {mode !== 'test' && <p className="text-xs text-neutral-500 mt-4">Character {index + 1} of {order.length} · Streak: {streak}</p>}
              {mode === 'test' && !testComplete && <p className="text-xs text-neutral-500 mt-4">Current streak: {streak}</p>}
              {mode === 'test' && testComplete && Object.keys(testWeakCharacters).length > 0 && (
                <div className="mt-4 w-full text-left">
                  <p className="text-xs text-neutral-400 mb-2">Characters to review</p>
                  <p className="text-xs text-neutral-500">{Object.entries(testWeakCharacters).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([char]) => char).join(' · ')}</p>
                </div>
              )}
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
              {[
                { label: 'Letters', count: 'A–Z · 4 sections' },
                { label: 'Numbers', group: 'Numbers' },
                { label: 'Punctuation', group: 'Punctuation' },
                { label: 'Special characters', group: 'Symbols' },
              ].map(({ label, group, count }) => {
                const isActive = practiceCategory === label
                const chars = REFERENCE_GROUPS.find((item) => item.label === group)?.chars ?? []
                const stageCount = label === 'Letters' ? 4 : 2
                return (
                  <div key={label} className={`rounded-lg border p-3 ${isActive ? 'border-signal bg-signal/5' : 'border-line'}`}>
                    <button
                      type="button"
                      onClick={() => selectPracticeCategory(label)}
                      aria-pressed={isActive}
                      className="w-full flex items-center justify-between gap-3 text-sm text-left"
                    >
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-neutral-500">{count ?? `${chars.length} characters · 2 stages`}</span>
                    </button>
                    {isActive && (
                      <div className="flex flex-col gap-2 mt-3">
                        {label === 'Letters'
                          ? LESSONS.filter((item) => item.id <= 4).map((section, index) => {
                              const isLocked = index > 0 && !completedPracticeLetterSections.includes(LESSONS[index - 1].id)
                              const isDone = completedPracticeLetterSections.includes(section.id)
                              const isSelected = practiceLetterSectionId === section.id
                              return (
                                <button
                                  key={section.id}
                                  type="button"
                                  disabled={isLocked}
                                  onClick={() => selectPracticeLetterSection(section.id)}
                                  aria-pressed={isSelected}
                                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs text-left ${
                                    isSelected ? 'border-signal text-signal' : 'border-line'
                                  } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-neutral-600'}`}
                                >
                                  <span className="flex items-center gap-2">
                                    {isDone ? <Check size={13} className="text-green-400" /> : isLocked ? <Lock size={13} /> : null}
                                    {section.label}
                                  </span>
                                  <span className="text-neutral-500">{isDone ? 'Completed' : isLocked ? 'Locked' : '90% to unlock next'}</span>
                                </button>
                              )
                            })
                          : Array.from({ length: stageCount }, (_, index) => {
                              const stage = index + 1
                              const stageKey = `${label}-${stage}`
                              const isLocked = stage > 1 && !completedPracticeGroupStages.includes(`${label}-1`)
                              const isDone = completedPracticeGroupStages.includes(stageKey)
                              const isSelected = practiceGroupStage === stage
                              const half = chars.length / 2
                              const stageChars = stage === 1 ? chars.slice(0, half) : chars.slice(half)
                              return (
                                <button
                                  key={stage}
                                  type="button"
                                  disabled={isLocked}
                                  onClick={() => selectPracticeGroupStage(stage)}
                                  aria-pressed={isSelected}
                                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs text-left ${
                                    isSelected ? 'border-signal text-signal' : 'border-line'
                                  } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-neutral-600'}`}
                                >
                                  <span className="flex items-center gap-2">
                                    {isDone ? <Check size={13} className="text-green-400" /> : isLocked ? <Lock size={13} /> : null}
                                    {label} {stage} · {stageChars.join(' ')}
                                  </span>
                                  <span className="text-neutral-500">{isDone ? 'Completed' : isLocked ? 'Locked' : '90% to unlock next'}</span>
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
              Score at least 90% in each stage to unlock the next stage. Each category keeps its own progress.
            </p>
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
              {LESSONS.map((l, idx) => {
                const isLocked = idx > 0 && !completed.includes(LESSONS[idx - 1].id)
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
                      {l.chars.length} {l.chars.length === 1 ? 'character' : 'characters'} · 15 questions
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