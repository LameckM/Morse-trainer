import { useState } from 'react'
import MorseTrainer from './components/MorseTrainer.jsx'
import MorseVisualiser from './components/MorseVisualiser.jsx'

export default function App() {
  const [page, setPage] = useState('trainer')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-6 min-h-16 flex items-center justify-between gap-4 flex-wrap py-3">
          <span className="font-display font-medium text-sm tracking-tight">Morse trainer</span>
          <nav className="flex items-center gap-1 bg-panel border border-line rounded-lg p-1" aria-label="Main navigation">
            <button
              type="button"
              onClick={() => setPage('trainer')}
              aria-current={page === 'trainer' ? 'page' : undefined}
              className={`text-sm px-3 py-2 rounded-md transition-colors ${
                page === 'trainer' ? 'bg-ink text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              Trainer
            </button>
            <button
              type="button"
              onClick={() => setPage('visualiser')}
              aria-current={page === 'visualiser' ? 'page' : undefined}
              className={`text-sm px-3 py-2 rounded-md transition-colors ${
                page === 'visualiser' ? 'bg-ink text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              Visualise
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 sm:py-10">
        {page === 'visualiser' ? <MorseVisualiser /> : <MorseTrainer />}
      </main>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-neutral-500">Built by Lameck</div>
      </footer>
    </div>
  )
}
