import { useState, useRef, useEffect } from 'react'
import { MORSE, LESSONS } from '../data/morseCode.js'
import { Check, Lock, Zap, Trash2 } from 'lucide-react'

const DOT_MS = 120
const DASH_THRESHOLD_MS = 250
const GAP_MS = 900
const PROGRESS_KEY = 'a4o-morse-progress'

function useBeep() {
  const ctxRef = useRef(null)
  const activeRef = useRef(null)

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return ctxRef.current
  }

  const start = () => {
    if (activeRef.current) return
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 600
    osc.type = 'sine'
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    activeRef.current = osc
  }

  const stop = () => {
    if (activeRef.current) {
      activeRef.current.stop()
      activeRef.current.disconnect()
      activeRef.current = null
    }
  }

  const playPattern = async (pattern) => {
    for (const symbol of pattern) {
      const duration = symbol === '.' ? DOT_MS : DOT_MS * 3
      start()
      await new Promise((r) => setTimeout(r, duration))
      stop()
      await new Promise((r) => setTimeout(r, DOT_MS))
    }
  }

  return { start, stop, playPattern }
}

export default function MorseTrainer() {
  const [lessonId, setLessonId] = useState(1)
  const [mode, setMode] = useState('practice')
  const [charIndex, setCharIndex] = useState(0)
  const [buffer, setBuffer] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [streak, setStreak] = useState(0)
  const [completed, setCompleted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || []
    } catch {
      return []
    }
  })

  const pressStart = useRef(null)
  const gapTimer = useRef(null)
  const { start, stop, playPattern } = useBeep()

  const lesson = LESSONS.find((l) => l.id === lessonId)
  const targetChar = lesson.chars[charIndex]
  const targetPattern = MORSE[targetChar]

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed))
  }, [completed])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        handleDown()
      }
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handleUp()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  const clearGapTimer = () => {
    if (gapTimer.current) clearTimeout(gapTimer.current)
  }

  const advance = (wasCorrect) => {
    setFeedback(wasCorrect ? 'correct' : 'wrong')
    setStreak((s) => (wasCorrect ? s + 1 : 0))
    setTimeout(() => {
      setFeedback(null)
      setBuffer([])
      if (charIndex + 1 >= lesson.chars.length) {
        setCompleted((c) => (c.includes(lessonId) ? c : [...c, lessonId]))
        setCharIndex(0)
      } else {
        setCharIndex((i) => i + 1)
      }
    }, 700)
  }

  const handleDown = () => {
    if (feedback || mode !== 'practice') return
    if (pressStart.current !== null) return
    clearGapTimer()
    pressStart.current = Date.now()
    start()
  }

  const handleUp = () => {
    if (pressStart.current === null) return
    stop()
    const duration = Date.now() - pressStart.current
    pressStart.current = null
    const symbol = duration < DASH_THRESHOLD_MS ? '.' : '-'
    const next = [...buffer, symbol]
    setBuffer(next)
    clearGapTimer()
    gapTimer.current = setTimeout(() => {
      advance(next.join('') === targetPattern)
    }, GAP_MS)
  }

  const runTest = async () => {
    setFeedback(null)
    await playPattern(targetPattern)
  }

  const handleGuess = (letter) => {
    if (feedback) return
    advance(letter === targetChar)
  }

  const selectLesson = (id) => {
    setLessonId(id)
    setCharIndex(0)
    setBuffer([])
    setFeedback(null)
  }

  const clearProgress = () => {
    const ok = window.confirm("Clear all lesson progress? This can't be undone.")
    if (!ok) return
    localStorage.removeItem(PROGRESS_KEY)
    setCompleted([])
    setLessonId(LESSONS[0].id)
    setCharIndex(0)
    setBuffer([])
    setFeedback(null)
    setStreak(0)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-medium">{lesson.label}</p>
          <p className="text-sm text-neutral-400">
            {mode === 'practice' ? 'Hold the button or spacebar to key' : 'Listen, then pick the letter'}
          </p>
        </div>
        <div className="flex gap-1 bg-panel border border-line rounded-lg p-1">
          {['practice', 'test'].map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setBuffer([])
                setFeedback(null)
              }}
              className={`text-sm px-3 py-1.5 rounded-md capitalize ${
                mode === m ? 'bg-ink text-neutral-100' : 'text-neutral-400'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-5">
        <div className="bg-panel border border-line rounded-xl p-8 flex flex-col items-center">
          {mode === 'practice' ? (
            <>
              <p className="text-sm text-neutral-500 mb-4">Send the letter</p>
              <p className="font-display text-4xl mb-6">{targetChar}</p>
              <button
                onMouseDown={handleDown}
                onMouseUp={handleUp}
                onMouseLeave={() => pressStart.current !== null && handleUp()}
                onTouchStart={handleDown}
                onTouchEnd={handleUp}
                aria-label="Key a dot or dash"
                className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-colors select-none ${
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
          ) : (
            <>
              <p className="text-sm text-neutral-500 mb-4">Play the sound, then guess</p>
              <button
                onClick={runTest}
                aria-label="Play the letter's morse pattern"
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
                      feedback && c === targetChar && feedback === 'correct'
                        ? 'border-green-500 bg-green-500/10'
                        : feedback && c === targetChar && feedback === 'wrong'
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
          <p className="text-xs text-neutral-500 mt-6">Streak: {streak}</p>
        </div>

        <div>
          <p className="text-sm text-neutral-500 mb-3">Lessons</p>
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
      </div>
    </div>
  )
}
