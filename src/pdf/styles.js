// Print style configs.
//
// The layout engine is shared; only this object changes between styles. A style
// is two ink values, two fonts, a bar treatment, a checkbox spec, and a target
// ink coverage. Nothing here knows how to draw — see layout.js.

/**
 * @typedef {object} StyleConfig
 * @property {string} id
 * @property {string} name
 * @property {[number,number,number]} primary  RGB 0-1, the body ink
 * @property {[number,number,number]} accent   RGB 0-1, used sparingly
 * @property {string} displayFont  'oswald' | 'archivo'
 * @property {number} bodySize     points
 * @property {object} bars         week/ramp/travel bar treatment
 * @property {object} checkbox     size, stroke, baseline
 * @property {object} coverage     target ink percentages
 */

const rgb255 = (r, g, b) => [r / 255, g / 255, b / 255];

export const PRESS_BLUE = rgb255(0x1b, 0x49, 0xa8);
export const NEAR_BLACK = rgb255(0x14, 0x14, 0x14);

export const STYLES = [
  {
    id: 'blueprint',
    name: 'Blueprint',
    blurb: 'Press blue and black. Solid week bars knocked out white, no legend, no title block.',
    primary: NEAR_BLACK,
    accent: PRESS_BLUE,
    paper: [1, 1, 1],
    displayFont: 'oswald',
    bodyFont: 'archivo',
    displaySize: 13,
    bodySize: 7.6,
    dayNumberSize: 15,
    bars: {
      week: { fill: 'accent', text: 'knockout', height: 15 },
      ramp: { fill: 'primary', text: 'knockout', height: 15 },
      travel: { fill: 'primary', text: 'knockout', band: true },
      rule: 0, // no cell hairlines; the bars do the work
    },
    checkbox: { size: 21, stroke: 1.5, baseline: 'cell-bottom', gap: 6 },
    margins: { top: 34, right: 34, bottom: 34, left: 34 },
    legend: false,
    titleBlock: false,
    statRow: false,
    smallCaps: false,
    coverage: { primary: [4, 7], accent: 5 },
  },
  {
    id: 'nautical',
    name: 'Nautical chart',
    blurb: 'Graphite and magenta. Magenta is reserved for travel and blackout days only.',
    primary: rgb255(0x33, 0x3a, 0x40),
    accent: rgb255(0xd6, 0x00, 0x6f),
    paper: [1, 1, 1],
    displayFont: 'archivo',
    bodyFont: 'archivo',
    displaySize: 11,
    bodySize: 7.2,
    dayNumberSize: 13,
    bars: {
      week: { fill: 'none', text: 'primary', height: 13, underline: 0.8 },
      ramp: { fill: 'none', text: 'primary', height: 13, underline: 0.4, dashed: true },
      travel: { fill: 'accent', text: 'knockout', band: true },
      rule: 0.4,
    },
    checkbox: { size: 16, stroke: 0.6, baseline: 'cell-bottom', gap: 5 },
    margins: { top: 38, right: 38, bottom: 38, left: 38 },
    legend: false,
    titleBlock: true,
    statRow: false,
    smallCaps: false,
    // Magenta appears on travel days only, so accent coverage runs near zero.
    coverage: { primary: [4, 7], accent: 1 },
  },
  {
    id: 'midcentury',
    name: 'Midcentury institutional',
    blurb: 'Presidential Fitness Test era. Single ink, heavy rules, condensed gothic.',
    primary: rgb255(0x1a, 0x1a, 0x1a),
    accent: rgb255(0x1a, 0x1a, 0x1a), // single ink: accent is the same plate
    paper: [1, 1, 1],
    displayFont: 'oswald',
    bodyFont: 'archivo',
    displaySize: 12,
    bodySize: 7.4,
    dayNumberSize: 14,
    bars: {
      week: { fill: 'primary', text: 'knockout', height: 16 },
      ramp: { fill: 'none', text: 'primary', height: 16, underline: 2 },
      travel: { fill: 'none', text: 'primary', band: false, hatch: true },
      rule: 1.2,
    },
    checkbox: { size: 18, stroke: 1.2, baseline: 'cell-bottom', gap: 6 },
    margins: { top: 36, right: 36, bottom: 36, left: 36 },
    legend: false,
    titleBlock: true,
    statRow: true,
    smallCaps: false,
    coverage: { primary: [5, 8], accent: 0 },
  },
  {
    id: 'scorecard',
    name: 'Golf scorecard',
    blurb: 'Boxed grid, hairline rules, small caps. Every cell closed on four sides.',
    primary: rgb255(0x1f, 0x2d, 0x24),
    accent: rgb255(0x8a, 0x6d, 0x3b),
    paper: [1, 1, 1],
    displayFont: 'archivo',
    bodyFont: 'archivo',
    displaySize: 10,
    bodySize: 7,
    dayNumberSize: 12,
    bars: {
      week: { fill: 'none', text: 'primary', height: 12, boxed: true },
      ramp: { fill: 'none', text: 'primary', height: 12, boxed: true, dashed: true },
      travel: { fill: 'accent', text: 'knockout', band: true },
      rule: 0.5,
      boxed: true,
    },
    checkbox: { size: 14, stroke: 0.5, baseline: 'cell-bottom', gap: 4 },
    margins: { top: 40, right: 40, bottom: 40, left: 40 },
    legend: false,
    titleBlock: true,
    statRow: true,
    smallCaps: true,
    coverage: { primary: [4, 6], accent: 2 },
  },
  {
    id: 'criterion',
    name: 'Criterion',
    blurb: 'High contrast, generous margins, a single accent used once per row.',
    primary: rgb255(0x0d, 0x0d, 0x0d),
    accent: rgb255(0xe0, 0x53, 0x1f),
    paper: [1, 1, 1],
    displayFont: 'oswald',
    bodyFont: 'archivo',
    displaySize: 14,
    bodySize: 7.6,
    dayNumberSize: 16,
    bars: {
      week: { fill: 'none', text: 'primary', height: 18, accentRule: 2.5 },
      ramp: { fill: 'none', text: 'primary', height: 18, accentRule: 0 },
      travel: { fill: 'none', text: 'primary', band: false, accentRule: 2.5 },
      rule: 0,
    },
    checkbox: { size: 19, stroke: 1, baseline: 'cell-bottom', gap: 7 },
    margins: { top: 56, right: 56, bottom: 56, left: 56 },
    legend: false,
    titleBlock: true,
    statRow: false,
    smallCaps: false,
    coverage: { primary: [3, 6], accent: 2 },
  },
];

export function getStyle(id) {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

/** CSS rgb() string, for the form's live thumbnails. */
export function css(rgbTriple) {
  const [r, g, b] = rgbTriple;
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export const PAPER = {
  letter: { portrait: [612, 792], landscape: [792, 612] },
  a4: { portrait: [595.28, 841.89], landscape: [841.89, 595.28] },
};

export function pageSize(paper, orientation) {
  return (PAPER[paper] ?? PAPER.letter)[orientation === 'portrait' ? 'portrait' : 'landscape'];
}
