# 🧉 Tomate un mate y cantá

A browser-only pitch trainer for singers. Sing into your microphone and watch
your pitch drawn on a piano roll in real time: piano keys on the left, time on
the X axis, the note you are singing on the Y axis.

It covers **pitch only**. No accounts, no server, no tracking: audio never
leaves your device.

## Features

- Piano keys from C1 to C7, every note a human voice can reach. Click, tap or
  slide across a key to hear a reference tone.
- Live readout of the closest note and how many cents you are off.
- Optional **scale**: pick a root and a type (major, natural minor, harmonic
  minor, melodic minor). In-scale rows get a soft green tint and the trace is
  coloured: **green** in tune, **yellow** a little off, **red** on a note
  outside the scale. Remove the scale and the trace goes back to plain ink.
- Light and dark (deep blue) themes.
- English and Spanish (Rioplatense voseo), picked from the browser language and
  switchable with the EN / ES button. Spanish defaults to Do-Re-Mi note names;
  either language can use letters or solfège (⚙ Settings → Note names).
- Start / Stop (`Space`) and Clear. Stopping keeps the take on the grid; the
  grid scrolls sideways (trackpad, scrollbar, touch or mouse drag) so a long
  take can be reviewed from the start.
- Zoom the keys, pick the horizontal speed, the tuning tolerance and the mic
  sensitivity in ⚙ Settings. Everything is remembered in `localStorage`.
- Works on phones in landscape; in portrait it asks you to rotate the device,
  since the keys and the grid need the width.

## Run it

Browsers only expose the microphone on `https://` or `localhost`, so open the
folder through any static server rather than double-clicking `index.html`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Host it on GitHub Pages

1. Push the repository to GitHub (`main` branch).
2. In the repository go to **Settings → Pages**.
3. Under **Build and deployment** choose **Deploy from a branch**, pick `main`
   and the `/ (root)` folder, then save.

The site is plain HTML, CSS and ES modules, so there is no build step. The
`.nojekyll` file tells Pages to serve the files exactly as they are.

## How it works

- `js/pitch.js` – YIN pitch detection on a 4096-sample window from the Web
  Audio `AnalyserNode`, about 40 estimates per second.
- `js/music.js` – note math, scale definitions and properly spelled note
  names (D harmonic minor shows C#, not Db), in letters or solfège.
- `js/i18n.js` – the English and Spanish UI strings.
- `js/synth.js` – a small additive voice for the reference tones.
- `js/app.js` – microphone capture, the piano roll renderer and the controls.
  The canvas only ever covers the visible viewport; a wide scroll area behind
  it provides native horizontal scrolling, so long takes stay cheap to draw.

Reference tones played through speakers are picked up by the microphone, so
they show up on the grid too. Use headphones if you want the trace to be only
your voice.
