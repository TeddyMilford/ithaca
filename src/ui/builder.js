// The builder.
//
// Stepped rather than one long form: one section open at a time, finished ones
// collapsed to a summary and one click from editing. "Show all" opens
// everything at once. Nothing is locked behind a modal.

import "../styles/app.css";

import { buildBlock } from "../lib/buildBlock.js";
import {
  BLOCK_LENGTHS,
  defaultFormState,
  generatePhases,
  MISS_BEHAVIORS,
} from "../lib/defaults.js";
import { addDays, diffDays, todayISO } from "../lib/dates.js";
import {
  allMovementsForSlot,
  EQUIPMENT,
  expandEquipment,
  formatPrescription,
  getMovement,
  isAvailable,
  MOVEMENTS,
  resolveMovement,
  slotLabel,
} from "../lib/movements.js";
import {
  equipmentAdvice,
  EXPERIENCE_LEVELS,
  GOALS,
  generateWeek,
  LIFT_DAY_CHOICES,
  progressionFor,
} from "../lib/generateWeek.js";
import { SESSION_TYPES, slotsFor, WORKOUT_SLOTS } from "../lib/sessions.js";
import { clear, hasSaved, load, save } from "../lib/store.js";
import { css, STYLES } from "../pdf/styles.js";
import { buildICS, icsFilename } from "../outputs/ics.js";
import { buildTracker, trackerFilename } from "../outputs/tracker.js";
import {
  download,
  exportJSON,
  importJSON,
  jsonFilename,
} from "../outputs/download.js";
import { weekPreview, weekSummary } from "./weekPreview.js";

const STEP_KEY = "ithaca.builder.step";
const WEEKDAYS = [
  ["sun", "Sunday"],
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
];

// In dev, a refresh is a clean slate: the from-scratch flow is the thing being
// worked on, and stale saved state hides it. Production keeps persistence.
if (import.meta.env.DEV) clear();

// Whether this browser has been here before, read before load() so it reflects
// the visit rather than the write load() may trigger.
const returning = hasSaved();

let state = load();
let step = 0;
let showAll = false;
const expanded = new Set(); // open weekday movement editors

// How far the form has been opened up. A first visit walks the steps one at a
// time; a returning one can reach any of them, including the output.
let unlockedThrough = 0;

// Step position is deliberately not persisted. A page load belongs at the top
// of the form, not three steps into the middle of it with no way to tell why.
// Answers are still saved, so nobody loses work on a refresh.
try {
  localStorage.removeItem(STEP_KEY);
} catch {
  /* fine */
}

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
};

function setState(patch, { rerender = true } = {}) {
  state = typeof patch === "function" ? patch(state) : { ...state, ...patch };
  save(state);
  if (rerender) render();
  else renderReview();
}

function goToStep(i) {
  const target = Math.max(0, Math.min(STEPS.length - 1, i));
  // Never land beyond a step that still needs an answer.
  const firstUnanswered = STEPS.findIndex((d) => d.complete && !d.complete());
  step =
    firstUnanswered >= 0 && target > firstUnanswered ? firstUnanswered : target;
  unlockedThrough = Math.max(unlockedThrough, step);
  render();
  // Land on the step you just opened, not wherever the page height left you.
  const open = $(".step.open");
  if (open) {
    const progressH = $(".progress")?.offsetHeight ?? 0;
    const top =
      open.getBoundingClientRect().top + window.scrollY - progressH - 8;
    window.scrollTo(0, Math.max(0, top));
  }
}

function status(msg, isError = false) {
  const node = $("#status");
  if (!node) return;
  node.textContent = msg;
  node.classList.toggle("error", isError);
}

// ---------------------------------------------------------------------------
// Small field helpers
// ---------------------------------------------------------------------------

function field(labelText, control, hint) {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return el("div", {}, [
    el("label", { htmlFor: id }, labelText),
    control,
    hint ? el("p", { className: "hint" }, hint) : null,
  ]);
}

/** ["a", "b", "c"] -> "a, b and c" */
function listSentence(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function select(value, options, onChange) {
  const s = el("select");
  for (const [val, label] of options) {
    s.append(
      el(
        "option",
        { value: val, selected: String(val) === String(value) },
        label,
      ),
    );
  }
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

/**
 * Big tappable single-choice buttons. `options` is [{ id, label, note }].
 */
function choices(current, options, onPick) {
  const box = el("div", { className: "choices" });
  for (const o of options) {
    const btn = el("button", { type: "button", className: "choice" }, [
      el("span", { className: "choice-n" }, o.big ?? null),
      el(
        "span",
        { className: o.big ? "choice-label" : "choice-name" },
        o.label,
      ),
      o.note ? el("span", { className: "choice-note" }, o.note) : null,
    ]);
    btn.setAttribute("aria-pressed", String(String(o.id) === String(current)));
    btn.addEventListener("click", () => onPick(o.id));
    box.append(btn);
  }
  return box;
}

/**
 * Re-draft everything the profile and equipment decide. Runs when either
 * changes. Progression always follows the goal; the week only follows until
 * the user takes it over by hand.
 */
function applyIntelligence(st) {
  const next = {
    ...st,
    progression: { ...st.progression, ...progressionFor(st.profile) },
  };
  if (!st.weekEdited) {
    const { week, notes } = generateWeek(st.profile, st.equipment);
    next.weekTemplate = week;
    next.weekNotes = notes;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Step bodies
// ---------------------------------------------------------------------------

function bodyYou() {
  const p = state.profile;
  const pick = (key) => (value) =>
    setState((st) =>
      applyIntelligence({ ...st, profile: { ...st.profile, [key]: value } }),
    );

  return el("div", {}, [
    el("h3", { className: "sub" }, "What are you after?"),
    choices(p.goal, GOALS, pick("goal")),
    el("h3", { className: "sub" }, "Where are you with lifting?"),
    choices(p.experience, EXPERIENCE_LEVELS, pick("experience")),
    el("h3", { className: "sub" }, "Lifting days per week"),
    choices(
      p.liftDays,
      LIFT_DAY_CHOICES.map((c) => ({
        id: c.id,
        big: String(c.id),
        label: "days",
        note: c.note,
      })),
      (v) => pick("liftDays")(Number(v)),
    ),
    el("h3", { className: "sub" }, "Home days (optional)"),
    el(
      "div",
      { className: "day-chips" },
      WEEKDAYS.map(([key, label]) => {
        const on = (p.wfhDays ?? []).includes(key);
        const chip = el(
          "button",
          { type: "button", className: "chip" },
          label.slice(0, 3),
        );
        chip.setAttribute("aria-pressed", String(on));
        chip.addEventListener("click", () => {
          const next = new Set(p.wfhDays ?? []);
          next.has(key) ? next.delete(key) : next.add(key);
          pick("wfhDays")([...next]);
        });
        return chip;
      }),
    ),
    el(
      "p",
      { className: "hint" },
      "Days you work from home. Lifting goes on them, since that is when a gym trip is easiest to fit. Leave it blank and nothing changes.",
    ),

    el("h3", { className: "sub" }, "How your lifts will progress"),
    el("p", { className: "prog-explain" }, progressionExplain()),
    el("p", { className: "avail-note" }, progressionSample()),
    el(
      "p",
      { className: "hint", style: "margin-top:1rem;" },
      "Your goal sets the progression. Your week is drafted from these answers too, and you can change all of it.",
    ),
  ]);
}

function bodyBlock() {
  const name = el("input", { type: "text", value: state.name });
  name.addEventListener("input", () =>
    setState({ name: name.value }, { rerender: false }),
  );

  const start = el("input", { type: "date", value: state.startDate });
  start.addEventListener(
    "change",
    () =>
      start.value && setState({ startDate: start.value }, { rerender: false }),
  );

  const ramp = el("input", {
    type: "number",
    min: "0",
    max: "60",
    value: String(state.rampDays),
  });
  ramp.addEventListener("change", () =>
    setState(
      { rampDays: Math.max(0, Number(ramp.value) || 0) },
      { rerender: false },
    ),
  );

  return el("div", { className: "grid" }, [
    field("Name", name),
    field("Start date", start, "Day 1."),
    field(
      "Length",
      select(
        state.blockLength,
        BLOCK_LENGTHS.map((n) => [n, `${n} days`]),
        (v) => {
          const blockLength = Number(v);
          setState({ blockLength, phases: generatePhases(blockLength) });
        },
      ),
    ),
    field("Ramp days", ramp, "Days before Day 1. Printed, but not numbered."),
    field(
      "If you miss a day",
      select(
        state.missBehavior,
        MISS_BEHAVIORS.map((b) => [b.id, b.label]),
        (v) => setState({ missBehavior: v }, { rerender: false }),
      ),
    ),
  ]);
}

/**
 * Every substitution the current equipment forces on the current week:
 * [{ from, to }] with to = null when nothing can fill the slot.
 */
function forcedSubstitutions() {
  const owned = expandEquipment(state.equipment);
  const subs = new Map();
  for (const day of Object.values(state.weekTemplate ?? {})) {
    for (const { id: workoutSlot } of WORKOUT_SLOTS) {
      const entry = day?.[workoutSlot];
      const type = SESSION_TYPES[entry?.session];
      if (!type) continue;
      for (const slot of type.slots) {
        const id = entry.slots?.[slot] ?? type.defaultSlots?.[slot];
        if (!id || subs.has(`${id}:${slot}`)) continue;
        const { movement, substituted } = resolveMovement(id, owned, slot);
        if (substituted || !movement) {
          subs.set(`${id}:${slot}`, {
            from: getMovement(id)?.name ?? id,
            to: movement?.name ?? null,
          });
        }
      }
    }
  }
  return [...subs.values()];
}

function bodyEquipment() {
  const bodyweight = state.equipment.length === 0;

  // Bodyweight is the same state as "nothing ticked", shown as a choice rather
  // than left implicit — otherwise an unanswered list and a deliberate
  // calisthenics answer look exactly alike. Ticking any real equipment clears
  // it on its own, because the list stops being empty.
  const noneInput = el("input", { type: "checkbox", checked: bodyweight });
  noneInput.addEventListener("change", () => {
    // Unticking it while nothing else is ticked would mean "no equipment, but
    // also not bodyweight", which is not a thing. Hold the state instead.
    if (!noneInput.checked) {
      noneInput.checked = true;
      return;
    }
    setState((st) => applyIntelligence({ ...st, equipment: [] }));
  });
  const noneRow = el(
    "label",
    { className: `check check-wide${bodyweight ? " on" : ""}` },
    [
      noneInput,
      el("span", {}, [
        el("strong", {}, "Calisthenics, bodyweight only"),
        el(
          "span",
          { className: "check-note" },
          "Nothing at all. Tick anything below and this clears.",
        ),
      ]),
    ],
  );

  const box = el("div", { className: "checks" });
  for (const e of EQUIPMENT) {
    if (e.id === "machine") continue; // implied by full gym, never checked directly
    const input = el("input", {
      type: "checkbox",
      checked: state.equipment.includes(e.id),
    });
    input.addEventListener("change", () => {
      const next = new Set(state.equipment);
      input.checked ? next.add(e.id) : next.delete(e.id);
      setState((st) => applyIntelligence({ ...st, equipment: [...next] }));
    });
    box.append(el("label", { className: "check" }, [input, e.label]));
  }

  // Live consequence: how much of the library this setup unlocks, and what the
  // current week has to swap out because of it.
  const owned = expandEquipment(state.equipment);
  const available = MOVEMENTS.filter((m) => isAvailable(m, owned)).length;
  const subs = forcedSubstitutions();
  const advice = equipmentAdvice(state.equipment);

  return el("div", {}, [
    noneRow,
    el("p", { className: "or-rule" }, "Additional resources"),
    box,
    el("p", { className: "avail-note" }, [
      el("strong", {}, `${available} of ${MOVEMENTS.length}`),
      " movements available with this setup.",
    ]),
    advice
      ? el("div", { className: "advice" }, [
          el("h3", { className: "sub" }, "What this leaves out"),
          el(
            "p",
            {},
            `Nothing here trains ${listSentence(advice.gaps.map((g) => g.toLowerCase()))}.`,
          ),
          advice.best
            ? el("p", {}, [
                "Adding ",
                el("strong", {}, advice.best.label.toLowerCase()),
                ` covers ${advice.best.fixes.length === advice.gaps.length ? "all of it" : listSentence(advice.best.fixes.map((f) => f.toLowerCase()))} `,
                `and opens up ${advice.best.unlocks} more movements.`,
              ])
            : null,
          el(
            "p",
            { className: "hint" },
            "Build the block anyway if you like. Those slots print empty.",
          ),
        ])
      : null,
    subs.length > 0
      ? el("div", { className: "subs" }, [
          el("h3", { className: "sub" }, "What your week swaps out"),
          el(
            "ul",
            {},
            subs.map((s) =>
              el(
                "li",
                {},
                s.to
                  ? [s.from, " → ", el("strong", {}, s.to)]
                  : [
                      s.from,
                      " → ",
                      el("strong", {}, "nothing available"),
                      ", so that slot prints empty",
                    ],
              ),
            ),
          ),
        ])
      : null,
    el(
      "p",
      { className: "hint", style: "margin:.9rem 0 0;" },
      "Untick something and every movement needing it drops to the closest one you can still do.",
    ),
  ]);
}

function bodyWeek() {
  const owned = expandEquipment(state.equipment);
  const rows = el("div");

  for (const [key, label] of WEEKDAYS) {
    const dayEntry = state.weekTemplate[key] ?? {};
    const row = el(
      "div",
      { className: "week-row" },
      el("div", { className: "dayname" }, label),
    );

    for (const {
      id: workoutSlot,
      label: workoutLabel,
      options,
    } of WORKOUT_SLOTS) {
      const entry = dayEntry[workoutSlot] ?? {};
      const type = SESSION_TYPES[entry.session] ?? null;
      const editorKey = `${key}.${workoutSlot}`;
      const isOpen = expanded.has(editorKey);

      const setWorkout = (patch) =>
        setState((st) => ({
          ...st,
          // A hand edit: the week is theirs now, the generator keeps off it.
          weekEdited: true,
          weekTemplate: {
            ...st.weekTemplate,
            [key]: {
              ...st.weekTemplate[key],
              [workoutSlot]: { ...entry, ...patch },
            },
          },
        }));

      const head = el("div", { className: "workout-row" }, [
        el("span", { className: `workout-tag ${workoutSlot}` }, workoutLabel),
        select(
          entry.session ?? "",
          options.map((id) => [id, SESSION_TYPES[id].label]),
          (v) => {
            // Changing the session type changes which slots exist, so refill them.
            setWorkout({ session: v, slots: slotsFor(v) });
          },
        ),
      ]);

      if (type && type.slots.length > 0) {
        const toggle = el(
          "button",
          { type: "button", className: "small expander" },
          isOpen ? "Hide" : "Movements",
        );
        toggle.addEventListener("click", () => {
          isOpen ? expanded.delete(editorKey) : expanded.add(editorKey);
          render();
        });
        head.append(toggle);
      }

      row.append(head);

      if (type?.freeLabel) {
        const labelInput = el("input", {
          type: "text",
          value: entry.label ?? "",
          placeholder: "Climbing, jiu-jitsu, dance, hockey",
          maxLength: "28",
        });
        // On change, not input: every keystroke would re-render and steal focus.
        labelInput.addEventListener("change", () =>
          setWorkout({ label: labelInput.value }),
        );
        row.append(
          el(
            "div",
            { className: "sport-label" },
            field("Name it. This is what prints.", labelInput),
          ),
        );
      }

      if (type && isOpen) {
        const grid = el("div", { className: "slot-grid" });
        for (const slot of type.slots) {
          if (type.defaultSlots?.[slot]) continue; // fixed by the session type
          const opts = allMovementsForSlot(slot).map((m) => [
            m.id,
            isAvailable(m, owned) ? m.name : `${m.name} — unavailable`,
          ]);
          opts.unshift(["", "— none —"]);
          grid.append(
            field(
              slotLabel(slot),
              select(entry.slots?.[slot] ?? "", opts, (v) => {
                setWorkout({
                  slots: { ...entry.slots, [slot]: v || undefined },
                });
              }),
            ),
          );
        }
        if (grid.children.length > 0)
          row.append(el("div", { className: "slot-editor" }, grid));
      }
    }

    rows.append(row);
  }

  const rebuild = el(
    "button",
    { type: "button", className: "small" },
    "Rebuild from my answers",
  );
  rebuild.addEventListener("click", () =>
    setState((st) => applyIntelligence({ ...st, weekEdited: false })),
  );

  const provenance = state.weekEdited
    ? el("div", { className: "gen-notes" }, [
        el(
          "p",
          {},
          "You have edited this week by hand. Your answers no longer touch it.",
        ),
        rebuild,
      ])
    : el(
        "div",
        { className: "gen-notes" },
        el(
          "ul",
          {},
          (state.weekNotes ?? []).map((n) => el("li", {}, n)),
        ),
      );

  return el("div", {}, [
    weekPreview(state.weekTemplate),
    el(
      "p",
      { className: "hint", style: "margin:.4rem 0 .9rem;" },
      weekSummary(state.weekTemplate),
    ),
    provenance,
    el(
      "p",
      { className: "hint", style: "margin:1rem 0 .9rem;" },
      "Two workouts a day, every day. One has to be outside. Change any of it below.",
    ),
    rows,
  ]);
}

/** The scheme in plain English: what goes up, by how much, and when. */
function progressionExplain() {
  const p = state.progression;
  const scheme =
    {
      double:
        `Start every lift at ${p.repLow} reps a set. Once you get ${p.repHigh} on all of them, ` +
        `put ${p.incrementUpper} lb on the bar upstairs or ${p.incrementLower} lb downstairs and go back ` +
        `to ${p.repLow}. That usually works out to a jump every two or three weeks.`,
      linear:
        `Add ${p.incrementUpper} lb to upper-body lifts and ${p.incrementLower} lb to lower-body ` +
        `lifts every week. Reps stay at ${p.repLow} to ${p.repHigh}.`,
      rpe:
        `Work at about an 8 out of 10 for ${p.repLow} to ${p.repHigh} reps. Once that same weight ` +
        `feels like a 7, add ${p.incrementUpper} lb upstairs or ${p.incrementLower} lb downstairs.`,
    }[p.scheme] ?? "";
  const stall =
    {
      deload10:
        "Stall twice on the same weight and take 10% off, then climb back.",
      repeat:
        "Stall and you run the same weight again next session until it moves.",
      rerange: "Stall and you change the rep range instead of adding weight.",
    }[p.stallRule] ?? "";
  return `${scheme} ${stall}`.trim();
}

/**
 * One real line from the user's own week, so the rep range is concrete.
 * Only a movement whose printed range actually reflects the configured reps
 * will do — a mobility stretch keeps its own scheme and would show a range
 * the user never chose, which is worse than showing no example at all.
 */
function progressionSample() {
  const { repLow, repHigh } = state.progression;
  const range = `${repLow}–${repHigh}`;
  for (const day of Object.values(state.weekTemplate ?? {})) {
    const entry = day?.indoor;
    const type = SESSION_TYPES[entry?.session];
    if (!type) continue;
    for (const slot of type.slots) {
      const m = getMovement(entry.slots?.[slot]);
      if (!m) continue;
      const line = formatPrescription(m, {
        sets: state.phases?.[0]?.sets,
        repLow,
        repHigh,
      });
      if (!line.includes(range)) continue;
      return `On the page, phase 1: ${m.name} ${line}`;
    }
  }
  return "";
}

function bodyLife() {
  const started = state.startDate && todayISO() >= state.startDate;

  const rows = el("div");
  state.exemptions.forEach((e, i) => {
    // Dates rerender so the "N days" hint tracks the range; the reason field
    // does not, so typing is never interrupted.
    const patch = (key, value, rerender = true) =>
      setState(
        {
          exemptions: state.exemptions.map((x, j) =>
            j === i ? { ...x, [key]: value } : x,
          ),
        },
        { rerender },
      );
    const mk = (key, type, placeholder = "") => {
      const input = el("input", { type, value: e[key] ?? "", placeholder });
      input.addEventListener("change", () =>
        patch(key, input.value, type !== "text"),
      );
      return input;
    };
    const remove = el(
      "button",
      { type: "button", className: "small" },
      "Remove",
    );
    remove.addEventListener("click", () =>
      setState({ exemptions: state.exemptions.filter((_, j) => j !== i) }),
    );

    const days = e.start
      ? Math.abs(diffDays(e.start, e.end || e.start)) + 1
      : 0;
    rows.append(
      el("div", { className: "exemption-row" }, [
        field(
          "Type",
          select(
            e.kind ?? "full",
            [
              ["full", "Full day off, no workouts"],
              ["half", "Half day, outdoor workout stays"],
            ],
            (v) => patch("kind", v),
          ),
        ),
        field("First day", mk("start", "date")),
        field(
          "Last day",
          mk("end", "date"),
          days > 1 ? `${days} days` : "Same day = one day",
        ),
        field("Reason", mk("label", "text", "Wedding, lake trip…")),
        el("div", { className: "exemption-remove" }, remove),
      ]),
    );
  });

  const nextStart = () =>
    state.exemptions.length
      ? addDays(state.exemptions.at(-1).end || state.exemptions.at(-1).start, 7)
      : state.startDate;

  const addExemption = (extra) =>
    setState({
      exemptions: [
        ...state.exemptions,
        // Flagged if the block has already begun; buildBlock warns on it.
        {
          start: nextStart(),
          end: nextStart(),
          label: "",
          kind: "full",
          declaredAfterStart: started,
          ...extra,
        },
      ],
    });

  const add = el(
    "button",
    { type: "button", className: "small" },
    "Add a day off",
  );
  add.addEventListener("click", () => addExemption({}));

  const addTrip = el(
    "button",
    { type: "button", className: "small" },
    "Add a trip",
  );
  addTrip.addEventListener("click", () => {
    const start = nextStart();
    // A trip is a range with the walks kept: half days, Fri-to-Sun sized.
    addExemption({ start, end: addDays(start, 2), kind: "half" });
  });

  // --- Daily rules ---
  const list = el("div");
  state.rules.slice(0, 6).forEach((rule, i) => {
    const input = el("input", { type: "text", value: rule, maxLength: "48" });
    input.addEventListener("change", () =>
      setState(
        {
          rules: state.rules.map((r, j) => (j === i ? input.value : r)),
        },
        { rerender: false },
      ),
    );
    const remove = el("button", { type: "button", className: "small" }, "×");
    remove.setAttribute("aria-label", `Remove rule ${i + 1}`);
    remove.addEventListener("click", () =>
      setState({ rules: state.rules.filter((_, j) => j !== i) }),
    );
    list.append(el("div", { className: "rule-row" }, [input, remove]));
  });

  const addRule = el(
    "button",
    { type: "button", className: "small" },
    "Add rule",
  );
  addRule.disabled = state.rules.length >= 6;
  addRule.addEventListener("click", () =>
    setState({ rules: [...state.rules, ""] }),
  );

  const hide = el("input", { type: "checkbox", checked: state.hideRules });
  hide.addEventListener("change", () => setState({ hideRules: hide.checked }));

  return el("div", {}, [
    el(
      "p",
      { className: "hint", style: "margin:0 0 .8rem;" },
      "A wedding, a lake weekend, a work trip. Set it aside here, before Day 1, with the reason written down. " +
        "The days still count toward the 75. Nothing you declare here resets you. " +
        "A half day drops the indoor workout and keeps the outdoor one, since you can walk anywhere.",
    ),
    started
      ? el("div", { className: "warnings" }, [
          el("h3", {}, "Block has started"),
          el(
            "p",
            { style: "margin:.4rem 0 0; font-size:.84rem;" },
            "Day 1 has passed. Anything added now is marked as declared late.",
          ),
        ])
      : null,
    state.exemptions.length
      ? rows
      : el("p", { className: "hint" }, "None set aside."),
    el("div", { className: "output-row", style: "margin-top:.8rem;" }, [
      add,
      addTrip,
    ]),
    el("h3", { className: "sub" }, "Daily rules"),
    list,
    addRule,
    el("label", { className: "check", style: "margin-top:.8rem;" }, [
      hide,
      "Keep rules off the page",
    ]),
  ]);
}

function thumbnail(style) {
  const primary = css(style.primary);
  const accent = css(style.accent);
  const bar = style.bars.week;
  const barFill =
    bar.fill === "accent"
      ? accent
      : bar.fill === "primary"
        ? primary
        : "transparent";
  const barText = bar.text === "knockout" ? "#fff" : primary;
  const days = ["REST", "GYM A", "FULL", "WALK", "GYM B", "GYM A", "SWIM"];
  const names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const cells = Array.from(
    { length: 7 },
    (_, i) => `
    <g transform="translate(${4 + i * 27.7}, 22)">
      <text x="0" y="6" font-size="3.6" fill="${primary}" font-family="sans-serif">${names[i]} ${i + 2}</text>
      <text x="24" y="7" font-size="7" font-weight="800" fill="${primary}" text-anchor="end" font-family="sans-serif">${i + 8}</text>
      <text x="0" y="14" font-size="3.8" font-weight="700" fill="${primary}" font-family="sans-serif">${days[i]}</text>
      <text x="0" y="20" font-size="3.4" fill="${primary}" font-family="sans-serif">Back squat</text>
      <text x="0" y="25" font-size="3.4" fill="${primary}" font-family="sans-serif">Bench 3×5</text>
      <rect x="0" y="30" width="7" height="7" fill="none" stroke="${primary}" stroke-width="${style.checkbox.stroke * 0.4}"/>
      <rect x="9" y="30" width="7" height="7" fill="none" stroke="${primary}" stroke-width="${style.checkbox.stroke * 0.4}"/>
    </g>`,
  ).join("");

  return `<svg class="thumb" viewBox="0 0 200 74" role="img" aria-label="${style.name} preview" preserveAspectRatio="none">
    <rect width="200" height="74" fill="#fff"/>
    <rect x="4" y="5" width="192" height="9" fill="${barFill}"/>
    ${bar.underline ? `<line x1="4" y1="14" x2="196" y2="14" stroke="${primary}" stroke-width="${bar.underline}"/>` : ""}
    ${bar.accentRule ? `<rect x="4" y="12.5" width="192" height="${bar.accentRule}" fill="${accent}"/>` : ""}
    <text x="7" y="12" font-size="5" font-weight="800" fill="${barText}" font-family="sans-serif">WEEK 2   PHASE 1</text>
    <text x="193" y="12" font-size="5" font-weight="800" fill="${barText}" text-anchor="end" font-family="sans-serif">D8–D14</text>
    ${cells}
  </svg>`;
}

function bodyStyle() {
  const cards = el("div", { className: "style-cards" });
  for (const s of STYLES) {
    const card = el("button", { type: "button", className: "card" });
    card.setAttribute("aria-pressed", String(state.style.id === s.id));
    card.innerHTML = thumbnail(s);
    card.append(
      el("div", { className: "card-name" }, s.name),
      el("p", { className: "desc" }, s.blurb),
    );
    card.addEventListener("click", () =>
      setState({ style: { ...state.style, id: s.id } }),
    );
    cards.append(card);
  }
  const patch = (k, v) => setState({ style: { ...state.style, [k]: v } });

  const printLoad = el("input", {
    type: "checkbox",
    checked: state.progression.printLoad,
  });
  printLoad.addEventListener("change", () =>
    setState({
      progression: { ...state.progression, printLoad: printLoad.checked },
    }),
  );

  return el("div", {}, [
    cards,
    el("div", { className: "grid", style: "margin-top:1.2rem;" }, [
      field(
        "Paper",
        select(
          state.style.paper,
          [
            ["letter", "US Letter"],
            ["a4", "A4"],
          ],
          (v) => patch("paper", v),
        ),
      ),
      field(
        "Orientation",
        select(
          state.style.orientation,
          [
            ["landscape", "Landscape"],
            ["portrait", "Portrait"],
          ],
          (v) => patch("orientation", v),
        ),
      ),
      field(
        "Weeks per page",
        select(
          state.style.weeksPerPage,
          [
            [1, "1"],
            [2, "2"],
            [3, "3"],
          ],
          (v) => patch("weeksPerPage", Number(v)),
        ),
      ),
    ]),
    el("label", { className: "check", style: "margin-top:1rem;" }, [
      printLoad,
      "Blank column for the weight you used",
    ]),
  ]);
}

function bodyDownload() {
  const pdf = el(
    "button",
    { type: "button", className: "primary pdf-cta" },
    "Print as PDF",
  );
  pdf.addEventListener("click", onDownloadPDF);
  // Start fetching the PDF code now, while they read the summary above it.
  loadPDFModule().catch(() => {
    /* the click reports it properly */
  });

  const ics = el("button", { type: "button" }, "Calendar (.ics)");
  ics.addEventListener("click", onDownloadICS);

  const tracker = el("button", { type: "button" }, "Offline tracker");
  tracker.addEventListener("click", onDownloadTracker);

  const json = el(
    "button",
    { type: "button", className: "small" },
    "Export setup",
  );
  json.addEventListener("click", onExportJSON);

  const fileInput = el("input", {
    type: "file",
    accept: ".json,application/json",
    className: "visually-hidden",
  });
  fileInput.addEventListener(
    "change",
    () => fileInput.files[0] && onImportJSON(fileInput.files[0]),
  );
  const importBtn = el(
    "button",
    { type: "button", className: "small" },
    "Import setup",
  );
  importBtn.addEventListener("click", () => fileInput.click());

  return el("div", {}, [
    el("div", { id: "review" }),
    el("div", { style: "margin-top:1.2rem;" }, pdf),
    el("p", { className: "status", id: "status" }, ""),
    el("h3", { className: "sub" }, "Also comes as"),
    el("div", { className: "output-row" }, [ics, tracker]),
    el("div", { className: "output-row", style: "margin-top:.5rem;" }, [
      json,
      importBtn,
      fileInput,
    ]),
    el(
      "p",
      { className: "hint", style: "margin-top:.8rem;" },
      "Put the .ics in its own calendar so you can delete it in one go. The tracker is one offline file; iOS Safari will not bookmark a local file. Export your setup to hand it to someone else.",
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  {
    id: "you",
    title: "About you",
    prompt: "Four questions. They fill in most of what follows.",
    body: bodyYou,
    summary: () => {
      const g = GOALS.find((x) => x.id === state.profile?.goal)?.label ?? "";
      return `${g} · ${state.profile?.liftDays ?? 3} lifting days`;
    },
  },
  {
    id: "block",
    title: "Block",
    prompt: "When it starts and how long it runs.",
    body: bodyBlock,
    summary: () =>
      `${state.blockLength} days from ${state.startDate}` +
      (state.rampDays ? `, ${state.rampDays} ramp days` : ""),
  },
  {
    id: "equipment",
    title: "Equipment",
    prompt:
      "Tick what you have. Your week will only ask for movements you can do.",
    body: bodyEquipment,
    summary: () => {
      if (state.equipment.length === 0) return "Calisthenics, bodyweight only";
      const names = state.equipment
        .map((id) => EQUIPMENT.find((e) => e.id === id)?.label)
        .filter(Boolean);
      return names.length > 3
        ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more`
        : names.join(", ");
    },
  },
  {
    id: "week",
    title: "Your week",
    prompt:
      "Built from your answers. One indoor and one outdoor workout a day, repeating weekly.",
    body: bodyWeek,
    summary: () =>
      weekSummary(state.weekTemplate) +
      (state.weekEdited ? " · customized" : ""),
  },
  {
    id: "life",
    title: "Days off and rules",
    prompt: "Days set aside in advance, and the rules you hold every day.",
    body: bodyLife,
    summary: () => {
      let full = 0;
      let half = 0;
      for (const e of state.exemptions) {
        if (!e.start) continue;
        const span = Math.abs(diffDays(e.start, e.end || e.start)) + 1;
        if (e.kind === "half") half += span;
        else full += span;
      }
      const bits = [];
      if (full) bits.push(`${full} day${full === 1 ? "" : "s"} off`);
      if (half) bits.push(`${half} half`);
      if (!bits.length) bits.push("no days off");
      const r = state.hideRules
        ? 0
        : state.rules.filter((x) => String(x).trim()).length;
      bits.push(`${r} rule${r === 1 ? "" : "s"}`);
      return bits.join(" · ");
    },
  },
  {
    id: "style",
    title: "Print style",
    prompt: null,
    body: bodyStyle,
    summary: () => {
      const s = STYLES.find((x) => x.id === state.style.id)?.name ?? "";
      return `${s} · ${state.style.paper === "a4" ? "A4" : "Letter"} ${state.style.orientation}`;
    },
  },
  {
    id: "download",
    title: "Output",
    prompt: null,
    body: bodyDownload,
    summary: () => "Ready",
    final: true,
  },
];

// ---------------------------------------------------------------------------
// Review panel
// ---------------------------------------------------------------------------

function renderReview() {
  const host = $("#review");
  if (!host) return;
  host.innerHTML = "";

  let block;
  try {
    block = buildBlock(state);
  } catch (err) {
    host.append(
      el("div", { className: "warnings" }, [
        el("h3", {}, "Cannot build"),
        el("p", {}, err.message),
      ]),
    );
    return;
  }

  const numbered = block.days.filter((d) => d.number != null);
  const training = numbered.filter(
    (d) => !d.exemption && d.sessions.length > 0,
  ).length;

  host.append(weekPreview(state.weekTemplate, { compact: true }));
  host.append(
    el("div", { className: "summary-figures", style: "margin-top:1rem;" }, [
      el("div", {}, [
        el("strong", {}, String(numbered.length)),
        el("span", {}, "numbered days"),
      ]),
      el("div", {}, [
        el("strong", {}, String(training)),
        el("span", {}, "training days"),
      ]),
      el("div", {}, [
        el("strong", {}, String(state.phases.length)),
        el("span", {}, "phases"),
      ]),
      el("div", {}, [
        el("strong", {}, numbered.at(-1)?.date ?? "—"),
        el("span", {}, "last day"),
      ]),
    ]),
  );

  host.append(el("h3", { className: "sub" }, "Progression"));
  host.append(el("p", { className: "prog-explain" }, progressionExplain()));

  if (block.warnings.length > 0) {
    host.append(
      el("div", { className: "warnings" }, [
        el(
          "h3",
          {},
          `${block.warnings.length} warning${block.warnings.length === 1 ? "" : "s"}`,
        ),
        el(
          "ul",
          {},
          block.warnings.map((w) => el("li", {}, w)),
        ),
        el(
          "p",
          { className: "hint", style: "margin-top:.5rem;" },
          "Warnings, not errors.",
        ),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

// pdf-lib and the fonts are about a megabyte, so they load on demand rather
// than up front. The import is warmed as soon as the output step is on screen:
// downloading a file is only reliably permitted close to the tap that asked
// for it, and waiting on a megabyte first is what pushes it out of that window
// on a phone. Cached, so it is fetched once however many PDFs get made.
let pdfModule = null;
const loadPDFModule = () => {
  pdfModule ??= import("../pdf/layout.js");
  return pdfModule;
};

async function onDownloadPDF() {
  status("Generating…");
  try {
    const { generatePDF, pdfFilename } = await loadPDFModule();
    const { bytes } = await generatePDF(state, buildBlock(state));
    download(
      pdfFilename(state),
      new Blob([bytes], { type: "application/pdf" }),
    );
    status(`Downloaded ${pdfFilename(state)}`);
  } catch (err) {
    console.error(err);
    status(`PDF failed: ${err.message}`, true);
  }
}

function onDownloadICS() {
  try {
    download(
      icsFilename(state),
      buildICS(state, buildBlock(state)),
      "text/calendar;charset=utf-8",
    );
    status("Downloaded.");
  } catch (err) {
    status(`Calendar export failed: ${err.message}`, true);
  }
}

function onDownloadTracker() {
  try {
    download(
      trackerFilename(state),
      buildTracker(state, buildBlock(state)),
      "text/html;charset=utf-8",
    );
    status("Downloaded.");
  } catch (err) {
    status(`Tracker export failed: ${err.message}`, true);
  }
}

function onExportJSON() {
  download(jsonFilename(state), exportJSON(state), "application/json");
  status("Downloaded.");
}

function onImportJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = importJSON(String(reader.result));
      save(state);
      expanded.clear();
      render();
      status("Imported.");
    } catch (err) {
      status(err.message, true);
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderStep(def, index) {
  const isOpen = showAll || index === step;
  // Any step already reached collapses to a summary you can click back into,
  // whether it sits before or after the one that is open.
  const isDone = !showAll && !isOpen && index <= unlockedThrough;
  const isLocked = !showAll && index > unlockedThrough;

  const node = el("section", {
    className: `step ${isOpen ? "open" : ""} ${isDone ? "done" : ""} ${isLocked ? "locked" : ""}`,
  });

  const header = el("div", { className: "step-head" }, [
    el("span", { className: "step-num" }, isDone ? "✓" : String(index + 1)),
    el("h2", { className: "step-title" }, def.title),
  ]);

  if (isDone) {
    header.append(el("span", { className: "step-summary" }, def.summary()));
    const edit = el(
      "button",
      { type: "button", className: "small step-edit" },
      "Change",
    );
    edit.addEventListener("click", () => goToStep(index));
    header.append(edit);
    header.classList.add("clickable");
    header.addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") goToStep(index);
    });
  }

  node.append(header);

  if (isOpen) {
    const panel = el("div", { className: "step-body" }, [
      def.prompt ? el("p", { className: "step-prompt" }, def.prompt) : null,
      def.body(),
    ]);

    if (!def.final) {
      const answered = def.complete ? def.complete() : true;
      const next = el(
        "button",
        { type: "button", className: "primary" },
        "Next",
      );
      next.disabled = !answered;
      next.addEventListener("click", () => goToStep(index + 1));

      const nav = el("div", { className: "step-nav" }, [next]);
      if (index > 0 && !showAll) {
        const back = el(
          "button",
          { type: "button", className: "link" },
          "← Back",
        );
        back.addEventListener("click", () => goToStep(index - 1));
        nav.append(back);
      }
      panel.append(nav);
    }
    node.append(panel);
  }

  return node;
}

function render() {
  const root = $("#app");
  const scroll = window.scrollY;
  root.innerHTML = "";

  // Progress
  const pct = Math.round((step / (STEPS.length - 1)) * 100);
  const bar = el("div", { className: "progress" }, [
    el(
      "div",
      { className: "progress-bar" },
      el("div", { className: "progress-fill", style: `width:${pct}%` }),
    ),
    el("div", { className: "progress-meta" }, [
      el("span", {}, showAll ? "All" : `${step + 1} / ${STEPS.length}`),
      (() => {
        const toggle = el(
          "button",
          { type: "button", className: "link" },
          showAll ? "Show one" : "Show all",
        );
        toggle.addEventListener("click", () => {
          showAll = !showAll;
          render();
        });
        return toggle;
      })(),
    ]),
  ]);
  root.append(bar);

  const startOver = () => {
    clear();
    state = defaultFormState();
    expanded.clear();
    unlockedThrough = 0;
    showAll = false;
    goToStep(0);
  };

  // A returning visitor lands at the top with their answers intact. Say so,
  // rather than leaving them to wonder why the form is already filled in.
  if (returning && !showAll) {
    const fresh = el("button", { type: "button", className: "small" }, "Start over");
    fresh.addEventListener("click", startOver);
    const jump = el("button", { type: "button", className: "small" }, "Go to the PDF");
    jump.addEventListener("click", () => goToStep(STEPS.length - 1));
    root.append(
      el("div", { className: "resume" }, [
        el("p", {}, "Your answers from last time are still here. Change any step, or go straight to the download."),
        el("div", { className: "output-row" }, [jump, fresh]),
      ]),
    );
  }

  STEPS.forEach((def, i) => root.append(renderStep(def, i)));

  const reset = el("button", { type: "button", className: "link" }, "Reset");
  reset.addEventListener("click", startOver);
  root.append(
    el("p", { style: "margin-top:2.5rem; text-align:center;" }, reset),
  );

  renderReview();
  window.scrollTo(0, scroll);
}

// Everything is already answered for a returning visitor, so every step is
// reachable straight away rather than making them click Next back through it.
if (returning) unlockedThrough = STEPS.length - 1;

render();
