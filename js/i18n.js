// UI strings. Spanish uses the Rioplatense voseo, like the app's title.

export const LANGUAGES = ['en', 'es'];

const STRINGS = {
  en: {
    'app.start': 'Start',
    'app.stop': 'Stop',
    'app.clear': 'Clear',
    'app.clearTitle': 'Clear the grid',
    'scale.label': 'Scale',
    'scale.none': 'No scale',
    'scale.remove': 'Remove scale',
    'scale.root': 'Scale root',
    'scale.type': 'Scale type',
    'scale.major': 'Major',
    'scale.minor': 'Natural minor',
    'scale.harmonic': 'Harmonic minor',
    'scale.melodic': 'Melodic minor',
    'scale.name.major': '{root} major',
    'scale.name.minor': '{root} natural minor',
    'scale.name.harmonic': '{root} harmonic minor',
    'scale.name.melodic': '{root} melodic minor',
    'zoom.out': 'Smaller keys',
    'zoom.fit': 'Fit',
    'zoom.fitTitle': 'Fit every key on screen',
    'zoom.in': 'Bigger keys',
    'settings.title': 'Settings',
    'settings.tolerance': 'Tolerance',
    'settings.speed': 'Speed',
    'settings.gate': 'Mic sensitivity',
    'settings.names': 'Note names',
    'tolerance.strict': 'strict',
    'tolerance.default': 'default',
    'tolerance.relaxed': 'relaxed',
    'speed.slow': 'Slow',
    'speed.normal': 'Normal',
    'speed.fast': 'Fast',
    'speed.faster': 'Very fast',
    'gate.high': 'High · quiet room',
    'gate.normal': 'Normal',
    'gate.low': 'Low · noisy room',
    'names.letters': 'C D E',
    'names.solfege': 'Do Re Mi',
    'theme.toDark': 'Switch to dark theme',
    'theme.toLight': 'Switch to light theme',
    'lang.switch': 'Cambiar a español',
    'hint.html': 'Press <b>Start</b>, allow the microphone and sing.<br>Click a piano key to hear a reference note.',
    'piano.label': 'Piano keys, click one to hear a reference note',
    'piano.play': 'Play {note}',
    'grid.label': 'Pitch grid',
    'status.noScale': 'No scale · pick one to tint the in-scale rows and color the trace',
    'status.scale': '{scale} · in-scale rows are tinted · tolerance ±{tol} ¢',
    'legend.good': 'in tune',
    'legend.meh': 'a bit off',
    'legend.bad': 'off scale',
    'kbd.space': 'Space',
    'kbd.hint': 'start / stop',
    'mic.unsupported': 'This browser cannot open the microphone here. Serve the page over https:// or from localhost.',
    'mic.denied': 'Microphone access was denied. Allow it in the browser’s site settings and press Start again.',
    'mic.error': 'Could not open the microphone ({name}).',
    'rotate.title': 'Rotate your phone',
    'rotate.body': 'The piano and the grid need the width of a landscape screen.',
  },
  es: {
    'app.start': 'Iniciar',
    'app.stop': 'Detener',
    'app.clear': 'Limpiar',
    'app.clearTitle': 'Limpiar la grilla',
    'scale.label': 'Escala',
    'scale.none': 'Sin escala',
    'scale.remove': 'Quitar la escala',
    'scale.root': 'Tónica de la escala',
    'scale.type': 'Tipo de escala',
    'scale.major': 'Mayor',
    'scale.minor': 'Menor natural',
    'scale.harmonic': 'Menor armónica',
    'scale.melodic': 'Menor melódica',
    'scale.name.major': '{root} mayor',
    'scale.name.minor': '{root} menor natural',
    'scale.name.harmonic': '{root} menor armónica',
    'scale.name.melodic': '{root} menor melódica',
    'zoom.out': 'Teclas más chicas',
    'zoom.fit': 'Ajustar',
    'zoom.fitTitle': 'Ver todas las teclas en pantalla',
    'zoom.in': 'Teclas más grandes',
    'settings.title': 'Ajustes',
    'settings.tolerance': 'Tolerancia',
    'settings.speed': 'Velocidad',
    'settings.gate': 'Sensibilidad del micrófono',
    'settings.names': 'Nombres de las notas',
    'tolerance.strict': 'estricta',
    'tolerance.default': 'por defecto',
    'tolerance.relaxed': 'relajada',
    'speed.slow': 'Lenta',
    'speed.normal': 'Normal',
    'speed.fast': 'Rápida',
    'speed.faster': 'Muy rápida',
    'gate.high': 'Alta · sala silenciosa',
    'gate.normal': 'Normal',
    'gate.low': 'Baja · sala ruidosa',
    'names.letters': 'C D E',
    'names.solfege': 'Do Re Mi',
    'theme.toDark': 'Cambiar al tema oscuro',
    'theme.toLight': 'Cambiar al tema claro',
    'lang.switch': 'Switch to English',
    'hint.html': 'Presioná <b>Iniciar</b>, permití el micrófono y cantá.<br>Tocá una tecla del piano para escuchar una nota de referencia.',
    'piano.label': 'Teclas del piano, tocá una para escuchar una nota de referencia',
    'piano.play': 'Tocar {note}',
    'grid.label': 'Grilla de afinación',
    'status.noScale': 'Sin escala · elegí una para pintar las filas de la escala y colorear el trazo',
    'status.scale': '{scale} · las filas de la escala están pintadas · tolerancia ±{tol} ¢',
    'legend.good': 'afinado',
    'legend.meh': 'un poco desafinado',
    'legend.bad': 'fuera de la escala',
    'kbd.space': 'Espacio',
    'kbd.hint': 'iniciar / detener',
    'mic.unsupported': 'Este navegador no puede abrir el micrófono acá. Serví la página por https:// o desde localhost.',
    'mic.denied': 'Se denegó el acceso al micrófono. Permitilo en la configuración del sitio y presioná Iniciar de nuevo.',
    'mic.error': 'No se pudo abrir el micrófono ({name}).',
    'rotate.title': 'Girá el teléfono',
    'rotate.body': 'El piano y la grilla necesitan el ancho de la pantalla en horizontal.',
  },
};

/** Picks the first browser language we support; English otherwise. */
export function detectLanguage() {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const tag of candidates) {
    const code = tag.toLowerCase().slice(0, 2);
    if (LANGUAGES.includes(code)) return code;
  }
  return 'en';
}

/** Returns a t(key, vars) function for the given language, falling back to English. */
export function translator(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key, vars = {}) => {
    let text = table[key] ?? STRINGS.en[key] ?? key;
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
}
