/**
 * MONARK design tokens — from the design handoff README. Exact values;
 * do not restyle.
 */
export const colors = {
  ink: '#0f2019',
  inkSecondary: '#1c332a',
  green: '#14584a',
  greenBgLight: '#eaf3ee',
  success: '#5aa584',
  gold: '#c9a35d',
  goldText: '#8a6b35',
  goldBg: '#f4ecdd',
  red: '#b3402e',
  redBg: '#faeeeb',
  redBorder: '#dfa89a',
  amber: '#b07c1e',
  amberBg: '#fdf6ec',
  amberBorder: '#ecd9b7',
  blue: '#4a6b8a',
  blueBg: '#edf2f7',
  text: '#182430',
  textSecondary: '#5c6b64',
  textSecondary2: '#6b7a72',
  muted: '#8b978f',
  faint: '#a5aca6',
  appBg: '#f4f3ee',
  card: '#ffffff',
  cardBorder: '#e0ddd4',
  divider: '#eeece5',
  pageBg: '#e9e7e1',
  // dashboard-specific accents used by the prototypes
  headerMuted: '#9db3a8',
  ringTrack: '#24382f',
  chevron: '#5d746a',
  scoreSub: '#7d948a',
  scoreLow: '#c96a52',
  scrim: 'rgba(15,32,25,0.45)',
  sheetHandle: '#d8d5cc',
  sheetClose: '#f0efe9',
  mockBorder: '#d9c396',
  mockText: '#a07b3f',
} as const;

/** IBM Plex family names as registered by @expo-google-fonts. */
export const sans = {
  400: 'IBMPlexSans_400Regular',
  500: 'IBMPlexSans_500Medium',
  600: 'IBMPlexSans_600SemiBold',
  700: 'IBMPlexSans_700Bold',
} as const;

export const mono = {
  400: 'IBMPlexMono_400Regular',
  500: 'IBMPlexMono_500Medium',
  600: 'IBMPlexMono_600SemiBold',
  700: 'IBMPlexMono_700Bold',
} as const;

type Weight = keyof typeof sans;

/** CSS `font: <w> <size>px 'IBM Plex Sans'` equivalent (letterSpacing in em). */
export function fSans(weight: Weight, size: number, lsEm = 0) {
  return { fontFamily: sans[weight], fontSize: size, letterSpacing: size * lsEm };
}

export function fMono(weight: Weight, size: number, lsEm = 0) {
  return { fontFamily: mono[weight], fontSize: size, letterSpacing: size * lsEm };
}

export const radius = { card: 12, button: 8, badge: 3, sheet: 18 } as const;
