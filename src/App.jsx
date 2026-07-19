import MorseTrainer from './components/MorseTrainer.jsx'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-2">
          {/* <span className="w-7 h-7 rounded-md bg-signal text-ink font-display font-bold text-sm flex items-center justify-center">
            •
          </span> */}
          <span className="font-display font-medium text-sm tracking-tight">Morse trainer</span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <MorseTrainer />
      </main>

      <footer className="border-t border-line">
        <div className="max-w-3xl mx-auto px-6 py-6 text-xs text-neutral-500">Built by Lameck</div>
      </footer>
    </div>
  )
}
