# Morse trainer

A small interactive morse code trainer. Three modes: learn the patterns, practice sending them by hand-timed input, and test yourself by ear.

**Live demo:** not available at the moment.

## What it does

Learn mode shows the dot and dash pattern for every character in the lesson. Tap one to hear it.

Practice mode reads your actual press timing. Tap for a dot, hold for a dash, using mouse, touch, or the spacebar. It decodes what you sent and checks it against the target character. On a miss it shows the correct pattern before moving on.

Test mode plays the real morse audio for a character through the Web Audio API, then you pick the character from a multiple-choice grid.

There are seven lessons: A-D, E-J, K-P, Q-Z, numbers, punctuation, and special characters, covering the full standard morse alphabet. Each round shuffles the lesson's characters, and you need to get 75% of them right to pass and unlock the next lesson. Progress is saved in localStorage so it's still there next time you open the page. Streak resets on a miss, standard drill-app behavior. There's a clear progress button under the lesson list if you want to wipe saved progress and start over, it asks for confirmation before it clears anything.

## Stack

React 18, Vite, Tailwind CSS, and lucide-react for icons. No backend and no database. Everything runs client side, including the audio.

## Run it locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Build for production

```bash
npm run build
```

This outputs a static site to `dist/`. It'll run on any static host, no server needed.

## Project structure

```
src/
  App.jsx                      header, layout, mounts the trainer
  components/MorseTrainer.jsx  all trainer logic and UI
  data/morseCode.js            the morse alphabet and lesson groupings
  index.css                    Tailwind, brand theme, animations
tailwind.config.js              brand tokens: ink (bg), panel (card), line (border), signal (accent)
```

## Adding more lessons

Edit `src/data/morseCode.js`. Each lesson is just an id, a label, and a list of characters pulled from the `MORSE` dictionary above it. Add a new entry to the `LESSONS` array and it shows up in the sidebar automatically, locked behind whichever lesson comes before it.

## Known limitations

The dash threshold (250ms) and dot length (120ms) are hardcoded in `MorseTrainer.jsx`. That's fine for most people, but worth turning into a settings or difficulty control if this grows.

There are no accounts, so progress is per browser, not per person. Fine for a personal project. You'd need a backend if you want progress to follow someone across devices.
