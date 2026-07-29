// @vitest-environment jsdom
//
// The PDF is the whole product and nothing else exercises it. Fonts are
// fetched at generation time, so fetch is pointed at the real files on disk.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildBlock } from '../src/lib/buildBlock.js';
import { defaultFormState } from '../src/lib/defaults.js';
import { generateWeek } from '../src/lib/generateWeek.js';
import { STYLES } from '../src/pdf/styles.js';

const ROOT = resolve(__dirname, '..');

beforeAll(() => {
  globalThis.fetch = async (url) => {
    const name = String(url).split('/').pop().split('?')[0]
      .replace(/-[A-Za-z0-9_-]{8,}\.ttf$/, '.ttf');
    const bytes = await readFile(resolve(ROOT, 'fonts', name));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
});

const stateFor = (over = {}) => {
  const base = defaultFormState();
  const equipment = over.equipment ?? base.equipment;
  const { week } = generateWeek(base.profile, equipment);
  return { ...base, equipment, weekTemplate: week, startDate: '2026-08-16', ...over };
};

describe('PDF generation', () => {
  it('produces a real PDF for the default block', async () => {
    const { generatePDF, pdfFilename } = await import('../src/pdf/layout.js');
    const state = stateFor();
    const { bytes } = await generatePDF(state, buildBlock(state));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pdfFilename(state)).toMatch(/\.pdf$/);
  });

  it('generates every print style without throwing', async () => {
    const { generatePDF } = await import('../src/pdf/layout.js');
    for (const style of STYLES) {
      const state = stateFor({ equipment: ['full_gym', 'track', 'pool'], style: { ...defaultFormState().style, id: style.id } });
      const { bytes } = await generatePDF(state, buildBlock(state));
      expect(new TextDecoder().decode(bytes.slice(0, 5)), style.id).toBe('%PDF-');
    }
  });

  it('handles the awkward blocks: bodyweight, days off, sports, both papers', async () => {
    const { generatePDF } = await import('../src/pdf/layout.js');
    const cases = [
      ['bodyweight only', stateFor({ equipment: [] })],
      ['days off + half days', stateFor({ exemptions: [
        { start: '2026-08-20', end: '2026-08-22', label: 'Wedding', kind: 'full' },
        { start: '2026-09-05', end: '2026-09-06', label: 'Lake', kind: 'half' },
      ] })],
      ['A4 portrait, 1/page', stateFor({ style: { ...defaultFormState().style, paper: 'a4', orientation: 'portrait', weeksPerPage: 1 } })],
      ['no ramp, load column', stateFor({ rampDays: 0, progression: { ...defaultFormState().progression, printLoad: true } })],
      ['rules hidden', stateFor({ hideRules: true })],
    ];
    for (const [label, state] of cases) {
      const { bytes } = await generatePDF(state, buildBlock(state));
      expect(new TextDecoder().decode(bytes.slice(0, 5)), label).toBe('%PDF-');
    }
  });
});
