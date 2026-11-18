# Morse trainer

A small interactive morse code trainer. Three modes: learn the patterns, practice sending them by hand-timed input, and test yourself by ear.

**Live demo:** not available at the moment.

## What it does

Learn mode is a full reference: every letter, number, and symbol with its dot and dash pattern, grouped by type. Tap one to hear it. It's not tied to lesson progress, so nothing in it is locked.

Practice mode reads your actual press timing. Tap for a dot, hold for a dash, using mouse, touch, or the spacebar. It decodes what you sent and checks it against the target character. On a miss it shows the correct pattern before moving on. Slipped mid-letter? Backspace or the Clear button wipes what you've keyed so far, so one stray tap doesn't cost the prompt.

Test mode is a 15 question mixed assessment: five visual questions (match a pattern to a character), five recall questions (key the code for a character yourself) and five listening questions (the real morse audio plays through the Web Audio API, then you pick the character). Listening questions allow two replays, and the results screen lists the correct code for every miss.

Every character lives in one of four groups: Letters, Numbers, Punctuation and Symbols. Each group is split into stages (Letters has four, the others two each), and the same ten stages drive both Practice and Test. A Practice round is 10 prompts (or one per character if a stage is bigger), dealt evenly so no character repeats back to back. Characters you miss get extra prompts in later rounds (in Practice and Test) until you answer them correctly a couple of times, and the Practice screen lists them under "Needs work". You need 9 of 10 to pass and unlock the next stage in that group. A Test is 15 mixed questions and needs 12 to pass; passing unlocks the next lesson in order. Progress is saved in localStorage so it's still there next time you open the page. Streak resets on a miss, standard drill-app behavior. There's a reset button on the Practice and Test screens if you want to wipe saved progress and start over, it asks for confirmation before it clears anything.

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
  data/morseCode.js            the morse alphabet and the group/stage definitions
  lib/rounds.js                shuffle and fair prompt sequencing
  index.css                    Tailwind, brand theme, animations
tailwind.config.js              brand tokens: ink (bg), panel (card), line (border), signal (accent)
```

## Adding more characters or stages

Edit `GROUPS` in `src/data/morseCode.js`. Each group has an id, a label and a list of stages, and each stage is a `part` name plus a list of characters pulled from the `MORSE` dictionary above it. Learn, Practice and Test all read from that one list, so a new stage shows up everywhere, locked behind whichever stage comes before it. Saved progress is keyed by stage id (like `letters-1`), so keep ids stable once people have progress.

## Known limitations

The dash threshold (250ms) and dot length (120ms) are hardcoded in `MorseTrainer.jsx`. That's fine for most people, but worth turning into a settings or difficulty control if this grows.

There are no accounts, so progress is per browser, not per person. Fine for a personal project. You'd need a backend if you want progress to follow someone across devices.
