import { useState } from 'react'
import { MORSE, MNEMONICS } from '../data/morseCode.js'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function MorseVisualiser() {
  const [selected, setSelected] = useState('A')
  const pattern = MORSE[selected]
  const signals = [...pattern]
  const phrase = MNEMONICS[selected] || []
  const phraseMatches = phrase.length === signals.length

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-signal mb-2">Morse reference</p>
        <h1 className="font-display text-3xl font-semibold text-neutral-100">Morse visualiser</h1>
        <p className="text-sm text-neutral-400 mt-2">
          Choose a letter to see every syllable matched to its exact dot or dash. Say the mnemonic aloud and follow its rhythm.
        </p>
      </header>

      <section className="bg-panel border border-line rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-neutral-200">Choose a letter</h2>
          <p className="text-xs text-neutral-500">A–Z</p>
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-13 gap-2" role="group" aria-label="Choose a letter">
          {LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => setSelected(letter)}
              aria-pressed={selected === letter}
              className={`aspect-square rounded-lg border font-display text-lg transition-colors ${
                selected === letter
                  ? 'border-signal bg-signal/15 text-signal'
                  : 'border-line text-neutral-300 hover:border-signal/60 hover:bg-signal/5'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-panel border border-line rounded-xl p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="font-display text-6xl leading-none text-neutral-100">{selected}</span>
            <div>
              <h2 className="font-semibold text-neutral-100">Mnemonic breakdown</h2>
              <p className="text-xs text-neutral-500 mt-1">Lowercase = dot · UPPERCASE = dash</p>
            </div>
          </div>
          <div className="rounded-lg border border-signal/40 bg-signal/5 px-4 py-2">
            <span className="text-xs text-neutral-500 mr-2">Morse code</span>
            <span className="font-mono text-xl tracking-[0.2em] text-signal">{pattern}</span>
          </div>
        </div>

        <div className="mt-7">
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-3">Say the mnemonic</p>
          {phraseMatches ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${signals.length}, minmax(0, 1fr))` }}>
              {signals.map((signal, index) => {
                const syllable = phrase[index]
                const isDash = signal === '-'
                return (
                  <div key={index} className="min-w-0 rounded-xl border border-line bg-ink/30 p-3 sm:p-5 text-center">
                    <p className="font-display text-base sm:text-2xl font-semibold text-neutral-100 break-words min-h-8">
                      {syllable}
                    </p>
                    <div className="h-16 flex items-center justify-center">
                      <span
                        role="img"
                        aria-label={isDash ? 'Dash' : 'Dot'}
                        className={`block bg-signal ${isDash ? 'w-12 sm:w-16 h-3 rounded-sm' : 'w-4 h-4 rounded-full'}`}
                      />
                    </div>
                    <p className="text-[10px] sm:text-xs uppercase tracking-widest text-neutral-500">
                      {isDash ? 'Dash' : 'Dot'}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-ink/30 p-4">
              <p className="text-sm text-neutral-400 mb-4">No matching mnemonic is available for this letter yet. Here is its exact Morse pattern:</p>
              <div className="flex flex-wrap gap-3">
                {signals.map((signal, index) => (
                  <div key={index} className="flex min-w-16 flex-col items-center gap-2">
                    <span className={`block bg-signal ${signal === '-' ? 'w-12 h-3 rounded-sm' : 'w-4 h-4 rounded-full'}`} />
                    <span className="text-xs text-neutral-500">{signal === '-' ? 'Dash' : 'Dot'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {phraseMatches && (
          <p className="mt-5 text-sm text-neutral-400">
            <span className="text-neutral-200 font-medium">{phrase.join(' - ')}</span>
            <span className="mx-2 text-neutral-600">→</span>
            <span className="font-mono tracking-widest text-signal">{pattern}</span>
          </p>
        )}
      </section>
    </section>
  )
}
