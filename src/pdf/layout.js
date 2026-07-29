// The shared PDF layout engine.
//
// One drawing routine, five style configs. Nothing in here branches on a style
// id — it reads geometry and ink from the config object, so adding a sixth
// style means adding a config, not editing this file.
//
// Landscape letter by default, two week rows per page, seven dated day cells
// per row. No prose in cells, no legend, no explanation of why anything is in
// the program.

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getStyle, pageSize } from './styles.js';
import { dayOfMonth, monthName } from '../lib/dates.js';

import oswaldBoldUrl from '../../fonts/Oswald-Bold.ttf?url';
import oswaldRegularUrl from '../../fonts/Oswald-Regular.ttf?url';
import archivoRegularUrl from '../../fonts/ArchivoNarrow-Regular.ttf?url';
import archivoBoldUrl from '../../fonts/ArchivoNarrow-Bold.ttf?url';

const FONT_URLS = {
  oswaldBold: oswaldBoldUrl,
  oswaldRegular: oswaldRegularUrl,
  archivoRegular: archivoRegularUrl,
  archivoBold: archivoBoldUrl,
};

const fontCache = new Map();

async function loadFontBytes(key) {
  if (fontCache.has(key)) return fontCache.get(key);
  const res = await fetch(FONT_URLS[key]);
  if (!res.ok) throw new Error(`Could not load font ${key}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  fontCache.set(key, bytes);
  return bytes;
}

/**
 * Tracks how much ink each plate lays down, as a fraction of page area.
 * Rectangles and rules are exact; text is estimated at a glyph coverage factor,
 * which is close enough to catch a style config that has gone heavy.
 */
const GLYPH_COVERAGE = 0.38;

class InkMeter {
  constructor(pageArea) {
    this.pageArea = pageArea;
    this.primary = 0;
    this.accent = 0;
  }

  rect(w, h, plate) {
    this[plate] += Math.max(0, w) * Math.max(0, h);
  }

  stroke(length, thickness, plate) {
    this[plate] += Math.max(0, length) * Math.max(0, thickness);
  }

  text(width, size, plate) {
    this[plate] += Math.max(0, width) * size * GLYPH_COVERAGE;
  }

  percent(plate) {
    return (this[plate] / this.pageArea) * 100;
  }
}

/** Truncate to fit a width, with an ellipsis when it does not. */
function fit(text, font, size, maxWidth) {
  const str = String(text ?? '');
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  const ell = '…';
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = str.slice(0, mid) + ell;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? str.slice(0, lo) + ell : '';
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Group days into week rows. Ramp days form their own leading rows, aligned so
 * the weekday columns line up with the numbered weeks below them.
 */
export function toWeekRows(days) {
  const rows = [];
  const ramp = days.filter((d) => d.isRamp);
  const numbered = days.filter((d) => !d.isRamp);

  if (ramp.length > 0) {
    // Pad the first ramp row so its weekdays sit under the right columns.
    const pad = ((ramp[0] ? weekdayCol(ramp[0]) : 0) + 7) % 7;
    const padded = [...Array(pad).fill(null), ...ramp];
    for (const week of chunk(padded, 7)) {
      rows.push({ kind: 'ramp', days: week, label: 'RAMP' });
    }
  }

  for (const week of chunk(numbered, 7)) {
    const first = week.find(Boolean);
    rows.push({
      kind: 'block',
      days: week,
      week: first?.week ?? null,
      phase: first?.phase ?? null,
    });
  }
  return rows;
}

const WEEKDAY_COLS = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
function weekdayCol(day) {
  return WEEKDAY_COLS[day.weekday] ?? 0;
}

export async function generatePDF(formState, block) {
  const style = getStyle(formState.style?.id);
  const [pageW, pageH] = pageSize(formState.style?.paper, formState.style?.orientation);
  const weeksPerPage = Math.max(1, Number(formState.style?.weeksPerPage) || 2);
  // One box per workout. Two a day, so two boxes.
  const checkboxCount = 2;
  const showRules = !formState.hideRules && (formState.rules ?? []).some((r) => r.trim());
  const showLoad = Boolean(formState.progression?.printLoad);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // subset:true so the file carries only the glyphs actually used.
  const [displayBytes, bodyBytes, bodyBoldBytes] = await Promise.all([
    loadFontBytes(style.displayFont === 'oswald' ? 'oswaldBold' : 'archivoBold'),
    loadFontBytes('archivoRegular'),
    loadFontBytes('archivoBold'),
  ]);
  const display = await doc.embedFont(displayBytes, { subset: true });
  const body = await doc.embedFont(bodyBytes, { subset: true });
  const bodyBold = await doc.embedFont(bodyBoldBytes, { subset: true });

  const primary = rgb(...style.primary);
  const accent = rgb(...style.accent);
  const paper = rgb(...style.paper);
  const plate = { primary, accent, knockout: paper };

  const m = style.margins;
  const contentW = pageW - m.left - m.right;
  const colW = contentW / 7;

  const rows = toWeekRows(block.days);
  const pages = chunk(rows, weeksPerPage);

  doc.setTitle(formState.name || 'Untitled');
  doc.setCreator('Ithaca Builder');
  doc.setProducer('Ithaca Builder');

  const coverageReport = [];

  for (const pageRows of pages) {
    const page = doc.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: paper });
    const ink = new InkMeter(pageW * pageH);

    let cursorY = pageH - m.top;

    // Optional title block. Blueprint has none: no title, no stat row, no legend.
    if (style.titleBlock) {
      const title = (formState.name || 'Untitled').toUpperCase();
      page.drawText(fit(title, display, style.displaySize, contentW), {
        x: m.left,
        y: cursorY - style.displaySize,
        size: style.displaySize,
        font: display,
        color: primary,
      });
      ink.text(display.widthOfTextAtSize(title, style.displaySize), style.displaySize, 'primary');
      cursorY -= style.displaySize + 10;
    }

    const footerH = showRules ? 18 : 0;
    const available = cursorY - m.bottom - footerH;
    const rowH = available / pageRows.length;

    for (let i = 0; i < pageRows.length; i += 1) {
      drawWeekRow({
        page,
        ink,
        row: pageRows[i],
        x: m.left,
        top: cursorY - i * rowH,
        width: contentW,
        height: rowH,
        colW,
        style,
        plate,
        display,
        body,
        bodyBold,
        checkboxCount,
        showLoad,
      });
    }

    if (showRules) {
      drawRuleStrip({
        page,
        ink,
        rules: formState.rules,
        x: m.left,
        y: m.bottom,
        width: contentW,
        style,
        font: body,
        plate,
      });
    }

    coverageReport.push({ primary: ink.percent('primary'), accent: ink.percent('accent') });
  }

  // Coverage check. A style config that runs a page past 15% is laying down far
  // more ink than the 4-7% target and will look and print wrong.
  reportCoverage(coverageReport, style);

  const bytes = await doc.save();
  return { bytes, coverage: coverageReport };
}

function reportCoverage(report, style) {
  const worst = report.reduce(
    (acc, p) => ({ primary: Math.max(acc.primary, p.primary), accent: Math.max(acc.accent, p.accent) }),
    { primary: 0, accent: 0 }
  );
  const total = worst.primary + worst.accent;
  const [lo, hi] = style.coverage.primary;
  if (total > 15) {
    console.warn(
      `[ithaca] Style "${style.id}" produced a page at ${total.toFixed(1)}% ink coverage. Target is ${lo}-${hi}% primary plus ~${style.coverage.accent}% accent; over 15% is a layout problem, not a taste one.`
    );
  } else {
    console.info(
      `[ithaca] Ink coverage: ${worst.primary.toFixed(1)}% primary, ${worst.accent.toFixed(1)}% accent (target ${lo}-${hi}% / ~${style.coverage.accent}%).`
    );
  }
}

function drawWeekRow({
  page, ink, row, x, top, width, height, colW, style, plate,
  display, body, bodyBold, checkboxCount, showLoad,
}) {
  const isRamp = row.kind === 'ramp';
  const barSpec = isRamp ? style.bars.ramp : style.bars.week;
  const barH = barSpec.height ?? 15;
  const barY = top - barH;

  // --- Week bar -----------------------------------------------------------
  const label = isRamp
    ? 'RAMP'
    : `WEEK ${row.week}${row.phase ? `   PHASE ${row.phase}` : ''}`;
  const range = (() => {
    const nums = row.days.filter(Boolean).map((d) => d.number).filter((n) => n != null);
    return nums.length ? `D${nums[0]}–D${nums.at(-1)}` : '';
  })();

  if (barSpec.fill === 'accent' || barSpec.fill === 'primary') {
    const fillPlate = barSpec.fill;
    page.drawRectangle({ x, y: barY, width, height: barH, color: plate[fillPlate] });
    ink.rect(width, barH, fillPlate);
  }
  if (barSpec.underline) {
    page.drawLine({
      start: { x, y: barY },
      end: { x: x + width, y: barY },
      thickness: barSpec.underline,
      color: plate.primary,
      dashArray: barSpec.dashed ? [3, 2] : undefined,
    });
    ink.stroke(width, barSpec.underline, 'primary');
  }
  if (barSpec.accentRule) {
    page.drawRectangle({ x, y: barY, width, height: barSpec.accentRule, color: plate.accent });
    ink.rect(width, barSpec.accentRule, 'accent');
  }

  const barTextColor = barSpec.text === 'knockout' ? plate.knockout : plate.primary;
  const barTextSize = barH * 0.6;
  const barBaseline = barY + (barH - barTextSize) / 2 + barTextSize * 0.16;
  page.drawText(label, {
    x: x + 5,
    y: barBaseline,
    size: barTextSize,
    font: display,
    color: barTextColor,
  });
  if (barSpec.text !== 'knockout') {
    ink.text(display.widthOfTextAtSize(label, barTextSize), barTextSize, 'primary');
  }
  if (range) {
    const w = display.widthOfTextAtSize(range, barTextSize);
    page.drawText(range, {
      x: x + width - w - 5,
      y: barBaseline,
      size: barTextSize,
      font: display,
      color: barTextColor,
    });
    if (barSpec.text !== 'knockout') ink.text(w, barTextSize, 'primary');
  }

  // --- Day cells ----------------------------------------------------------
  const cellTop = barY - 2;
  const cellH = height - barH - 6;
  const cb = style.checkbox;
  // Common baseline at cell bottom: every checkbox on the row sits on one line.
  const checkboxY = cellTop - cellH + 2;
  const contentBottom = checkboxCount > 0 ? checkboxY + cb.size + cb.gap : checkboxY;

  for (let c = 0; c < 7; c += 1) {
    const day = row.days[c];
    const cx = x + c * colW;
    if (!day) continue;

    if (style.bars.rule > 0) {
      page.drawLine({
        start: { x: cx, y: cellTop },
        end: { x: cx, y: cellTop - cellH },
        thickness: style.bars.rule,
        color: plate.primary,
      });
      ink.stroke(cellH, style.bars.rule, 'primary');
      if (style.bars.boxed) {
        page.drawLine({
          start: { x: cx, y: cellTop - cellH },
          end: { x: cx + colW, y: cellTop - cellH },
          thickness: style.bars.rule,
          color: plate.primary,
        });
        ink.stroke(colW, style.bars.rule, 'primary');
      }
    }

    drawDayCell({
      page, ink, day, x: cx, top: cellTop, width: colW - 4, height: cellH,
      style, plate, display, body, bodyBold, checkboxCount, checkboxY, contentBottom, showLoad,
    });
  }

  // Close the right edge of a boxed grid.
  if (style.bars.rule > 0) {
    page.drawLine({
      start: { x: x + width, y: cellTop },
      end: { x: x + width, y: cellTop - cellH },
      thickness: style.bars.rule,
      color: plate.primary,
    });
    ink.stroke(cellH, style.bars.rule, 'primary');
  }
}

function drawDayCell({
  page, ink, day, x, top, width, height, style, plate,
  display, body, bodyBold, checkboxCount, checkboxY, contentBottom, showLoad,
}) {
  const pad = 4;
  const innerX = x + pad;
  const innerW = width - pad;
  let y = top - 2;

  const travelSpec = style.bars.travel;
  // The banded "day off" treatment is for full days off only; a half day keeps
  // its remaining workout, so it reads like a training day with a label.
  const isOff = Boolean(day.exemption) && day.sessions.length === 0;
  const headerH = style.dayNumberSize + 2;

  // A declared day off gets the header band, weekday knocked out.
  if (isOff && travelSpec.band) {
    const bandPlate = travelSpec.fill === 'accent' ? 'accent' : 'primary';
    page.drawRectangle({ x, y: y - headerH, width, height: headerH, color: plate[bandPlate] });
    ink.rect(width, headerH, bandPlate);
  }
  const headerColor = isOff && travelSpec.band ? plate.knockout : plate.primary;

  const dateLabel = `${day.weekday} ${dayOfMonth(day.date)}`;
  const dateSize = style.bodySize;
  page.drawText(fit(dateLabel, body, dateSize, innerW * 0.62), {
    x: innerX, y: y - dateSize - 1, size: dateSize, font: body, color: headerColor,
  });
  if (!(isOff && travelSpec.band)) {
    ink.text(body.widthOfTextAtSize(dateLabel, dateSize), dateSize, 'primary');
  }

  // Day number, right-aligned. Ramp days carry none.
  if (day.number != null) {
    const num = String(day.number);
    const size = style.dayNumberSize;
    const w = display.widthOfTextAtSize(num, size);
    page.drawText(num, { x: x + width - w, y: y - size, size, font: display, color: headerColor });
    if (!(isOff && travelSpec.band)) ink.text(w, size, 'primary');
  }

  y -= headerH + 2;

  // A day off prints its label and nothing else. A half day prints the label
  // and then falls through to its remaining workout.
  if (day.exemption) {
    const label = String(day.exemption.label).toUpperCase();
    const half = !isOff;
    if (half) {
      const text = `HALF · ${label}`;
      page.drawText(fit(text, bodyBold, style.bodySize, innerW), {
        x: innerX, y: y - style.bodySize, size: style.bodySize, font: bodyBold, color: plate.accent,
      });
      ink.text(bodyBold.widthOfTextAtSize(text, style.bodySize), style.bodySize, 'accent');
      y -= style.bodySize + 3;
    } else if (!travelSpec.band) {
      page.drawText(fit(label, bodyBold, style.bodySize, innerW), {
        x: innerX, y: y - style.bodySize, size: style.bodySize, font: bodyBold, color: plate.accent,
      });
      ink.text(bodyBold.widthOfTextAtSize(label, style.bodySize), style.bodySize, 'accent');
    } else {
      page.drawText(fit(label, body, style.bodySize, innerW), {
        x: innerX, y: y - style.bodySize, size: style.bodySize, font: body, color: plate.primary,
      });
      ink.text(body.widthOfTextAtSize(label, style.bodySize), style.bodySize, 'primary');
    }
    if (isOff) return;
  }

  // Two workouts, in printing order, each with its own heading.
  const lineH = style.bodySize + 1.9;
  const headSize = style.bodySize + 0.4;

  for (const session of day.sessions) {
    if (y - headSize < contentBottom) break;

    // Slot marker plus session name: "OUT · RUN".
    const marker = session.slot === 'outdoor' ? 'OUT' : 'IN';
    const heading = `${marker}  ${session.name}`;
    page.drawText(fit(heading, bodyBold, headSize, innerW), {
      x: innerX, y: y - headSize, size: headSize, font: bodyBold, color: plate.primary,
    });
    ink.text(Math.min(bodyBold.widthOfTextAtSize(heading, headSize), innerW), headSize, 'primary');
    y -= headSize + 1.6;

    for (const mv of session.movements) {
      if (y - lineH < contentBottom) break;
      const pres = mv.prescription;
      const presW = body.widthOfTextAtSize(pres, style.bodySize);
      const nameMax = innerW - Math.min(presW, innerW * 0.34) - 3;

      page.drawText(fit(mv.name, body, style.bodySize, nameMax), {
        x: innerX, y: y - style.bodySize, size: style.bodySize, font: body, color: plate.primary,
      });
      ink.text(Math.min(body.widthOfTextAtSize(mv.name, style.bodySize), nameMax), style.bodySize, 'primary');

      page.drawText(pres, {
        x: x + width - presW, y: y - style.bodySize, size: style.bodySize, font: body, color: plate.primary,
      });
      ink.text(presW, style.bodySize, 'primary');
      y -= lineH;

      if (showLoad && !mv.calisthenic) {
        const ruleW = innerW * 0.3;
        page.drawLine({
          start: { x: x + width - ruleW, y: y + lineH - style.bodySize - 2 },
          end: { x: x + width, y: y + lineH - style.bodySize - 2 },
          thickness: 0.3, color: plate.primary,
        });
        ink.stroke(ruleW, 0.3, 'primary');
      }
    }
    y -= 2;
  }

  // One checkbox per workout, on the row's common baseline.
  const cb = style.checkbox;
  for (let i = 0; i < day.checkboxes && i < checkboxCount; i += 1) {
    const bx = innerX + i * (cb.size + cb.gap);
    page.drawRectangle({
      x: bx, y: checkboxY, width: cb.size, height: cb.size,
      borderColor: plate.primary, borderWidth: cb.stroke,
    });
    ink.stroke(cb.size * 4, cb.stroke, 'primary');
  }
}

function drawRuleStrip({ page, ink, rules, x, y, width, style, font, plate }) {
  const list = (rules ?? []).map((r) => String(r).trim()).filter(Boolean).slice(0, 6);
  if (list.length === 0) return;
  const text = list.join('   ·   ').toUpperCase();
  const size = style.bodySize - 0.4;
  page.drawText(fit(text, font, size, width), {
    x,
    y,
    size,
    font,
    color: plate.primary,
  });
  ink.text(Math.min(font.widthOfTextAtSize(text, size), width), size, 'primary');
}

export function pdfFilename(formState) {
  const slug = String(formState.name || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';
  return `${slug}-${formState.startDate}.pdf`;
}
