// Paleta fixa do jogo. Nenhuma cor solta no código: tudo vem daqui.
export const PAL = {
  bg: 0x0b0b14,
  panel: 0x05050a,
  label: 0x050814,
  grid: 0x14142a,

  cyan: 0x00f0ff,
  cyanDark: 0x087d8c,
  teal: 0x05d9e8,

  pink: 0xff2a6d,
  pinkDark: 0x8f1a44,

  orange: 0xff9e00,
  orangeDark: 0x9a5a00,

  purple: 0xb14aed,
  purpleDark: 0x5f2a8a,
  purpleLight: 0xd9a0ff,

  yellow: 0xf5e642,
  white: 0xffffff,

  text: 0x99eeff,
  textDim: 0x7a8fa6,
  textFaint: 0x4a5a6e,
} as const;

/** número 0xRRGGBB -> '#rrggbb' (para textos e canvas) */
export const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** a mesma paleta em strings CSS */
export const CSS = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, css(v)])) as Record<
  keyof typeof PAL,
  string
>;