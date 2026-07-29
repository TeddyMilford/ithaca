// @vitest-environment jsdom
//
// localStorage only exists in a DOM, and this file is about what the browser
// remembers between visits.

import { describe, expect, it, beforeEach } from 'vitest';
import { hasSaved, save, clear, load } from '../src/lib/store.js';
import { defaultFormState } from '../src/lib/defaults.js';

describe('first visit vs returning visit', () => {
  beforeEach(() => clear());

  it('reports no saved state for a stranger', () => {
    expect(hasSaved()).toBe(false);
  });

  it('reports saved state once answers have been written', () => {
    save(defaultFormState());
    expect(hasSaved()).toBe(true);
  });

  it('keeps the answers a returning visitor already gave', () => {
    const st = { ...defaultFormState(), name: 'Ithaca block', blockLength: 90 };
    save(st);
    const back = load();
    expect(back.name).toBe('Ithaca block');
    expect(back.blockLength).toBe(90);
  });

  it('clears cleanly, so Start over really is a first visit', () => {
    save(defaultFormState());
    clear();
    expect(hasSaved()).toBe(false);
  });
});
