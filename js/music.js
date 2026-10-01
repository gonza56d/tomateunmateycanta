// Note math, note naming and scales.

export const A4 = 440;
export const LOW_MIDI = 24;   // C1  (32.7 Hz) — below any trained bass
export const HIGH_MIDI = 96;  // C7  (2093 Hz) — above the soprano high C, into whistle register
export const NOTE_COUNT = HIGH_MIDI - LOW_MIDI + 1;

export const SCALE_TYPES = {
  major:    { intervals: [0, 2, 4, 5, 7, 9, 11], minor: false },
  minor:    { intervals: [0, 2, 3, 5, 7, 8, 10], minor: true },
  harmonic: { intervals: [0, 2, 3, 5, 7, 8, 11], minor: true },
  melodic:  { intervals: [0, 2, 3, 5, 7, 9, 11], minor: true },
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const SOLFEGE = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

// Keys that are conventionally written with flats; everything else uses sharps.
const MAJOR_FLAT_ROOTS = new Set([5, 10, 3, 8, 1]);      // F  Bb Eb Ab Db
const MINOR_FLAT_ROOTS = new Set([2, 7, 0, 5, 10, 3]);   // Dm Gm Cm Fm Bbm Ebm

/** Renders a letter-based name ("F#", "Bb") in the chosen naming system. */
export const spell = (name, names) => (names === 'solfege' ? SOLFEGE[name[0]] + name.slice(1) : name);

/** Label for a root picker entry: "C", "C# / Db", "Do# / Reb"… */
export function rootLabel(pc, names) {
  const sharp = spell(SHARP_NAMES[pc], names);
  const flat = spell(FLAT_NAMES[pc], names);
  return sharp === flat ? sharp : `${sharp} / ${flat}`;
}

export const pcOf = (midi) => ((midi % 12) + 12) % 12;
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;
export const isBlackKey = (midi) => BLACK_PCS.has(pcOf(midi));
export const freqToMidi = (freq) => 69 + 12 * Math.log2(freq / A4);
export const midiToFreq = (midi) => A4 * Math.pow(2, (midi - 69) / 12);

/**
 * Builds a scale with properly spelled degrees (one note per letter), so that
 * D harmonic minor shows C# rather than Db, and A melodic minor shows F# G#.
 */
export function buildScale(rootPc, typeKey) {
  const type = SCALE_TYPES[typeKey];
  if (!type) return null;
  const useFlats = (type.minor ? MINOR_FLAT_ROOTS : MAJOR_FLAT_ROOTS).has(rootPc);
  const rootName = (useFlats ? FLAT_NAMES : SHARP_NAMES)[rootPc];
  const rootLetter = LETTERS.indexOf(rootName[0]);
  const pcs = new Set();
  const spelling = new Map();

  type.intervals.forEach((interval, degree) => {
    const pc = (rootPc + interval) % 12;
    const letterIdx = (rootLetter + degree) % 7;
    let accidental = pc - LETTER_PC[letterIdx];
    if (accidental > 6) accidental -= 12;
    if (accidental < -6) accidental += 12;
    // Double accidentals (F## in G# harmonic minor) are correct on paper but
    // unreadable at a glance, so fall back to the plain enharmonic name.
    const name = Math.abs(accidental) > 1
      ? (useFlats ? FLAT_NAMES : SHARP_NAMES)[pc]
      : LETTERS[letterIdx] + (accidental === 1 ? '#' : accidental === -1 ? 'b' : '');
    pcs.add(pc);
    spelling.set(pc, name);
  });

  return { rootPc, typeKey, useFlats, pcs, spelling, rootName, key: `${rootName}|${typeKey}` };
}

function letterName(midi, scale) {
  const pc = pcOf(midi);
  if (scale && scale.spelling.has(pc)) return scale.spelling.get(pc);
  return (scale && scale.useFlats ? FLAT_NAMES : SHARP_NAMES)[pc];
}

export function pitchClassName(midi, scale, names = 'letters') {
  return spell(letterName(midi, scale), names);
}

export function noteName(midi, scale, names = 'letters') {
  const name = letterName(midi, scale);
  let octave = octaveOf(midi);
  if (name === 'B#') octave -= 1; // B#3 is the same key as C4
  if (name === 'Cb') octave += 1; // Cb4 is the same key as B3
  return `${spell(name, names)}${octave}`;
}

/**
 * 'plain' when no scale is set; otherwise 'good' (within tolerance of an
 * in-scale note), 'meh' (in-scale note but off by more than the tolerance),
 * or 'bad' (closest note is not in the scale).
 */
export function statusOf(midi, scale, toleranceCents) {
  if (!scale) return 'plain';
  const nearest = Math.round(midi);
  if (!scale.pcs.has(pcOf(nearest))) return 'bad';
  return Math.abs((midi - nearest) * 100) <= toleranceCents ? 'good' : 'meh';
}
