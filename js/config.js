"use strict";

/*
  Lock-In Tracker - config and data model (step 1)

  Single source of truth. Add, rename or retime a habit here and the daily
  screen, CSV columns and weekly report all follow (built in later steps).

  Habit fields
    id              unique key, becomes the CSV column name
    cadence         "daily" | "weekly"
    group           section heading on screen
    label           text shown to you
    type            "check"   done / not done
                    "minutes" minutes spent, done when >= target
                    "count"   a number, done when >= target
                    "limit"   a cap, done when logged and <= limit (doomscrolling)
                    "derived" weekly only, computed from daily data (step 4)
    target / limit  the number for minutes, count and limit types
    plannedMinutes  counts toward the planned daily time total
    window          "AM" | "PM" (display hint only)
    optional        true = never blocks a Full day (for example a nap)
    phases          date-based label changes
    notes           date-based reminders (from / to are inclusive, YYYY-MM-DD)
*/

const CONFIG = {
  appName: "Lock-In Tracker",
  trackerMonths: 12,
  blockDays: 75,                 // consistency milestone, repeats across the 12 months
  weekStartsOn: 1,               // Monday
  timeFlag: { warnAboveMinutes: 240 },   // flag the day when planned time passes this
  moods: ["Calm", "Happy", "Motivated", "Tired", "Flat", "Anxious", "Irritable", "Low"],
  exerciseTypes: ["Strength", "Cardio", "Stretching", "Yoga", "Other"],
  energyScale: [1, 5],

  // Leniency. No resets and no penalties. A day counts as "showed up" when it is
  // Full, Minimum, or marked Heavy. Otherwise it stays "open" and can be filled in later.
  dayStates: {
    full:    { label: "Full",    showedUp: true },
    minimum: { label: "Minimum", showedUp: true },
    heavy:   { label: "Heavy day", showedUp: true },   // set manually, always counts
    open:    { label: "Open",    showedUp: false }
  }
};

// The Minimum set: meet these and the day counts even if the rest slips.
const MINIMUM = [
  { id: "water_wake" },
  { id: "journal" },
  { id: "walk", atLeast: 10 },
  { id: "meals", atLeast: 1 }
];

const HABITS = [
  // ---------- DAILY ----------
  // Body
  { id: "walk", cadence: "daily", group: "Body", label: "Walk", type: "minutes", target: 20, plannedMinutes: 20 },
  { id: "meals", cadence: "daily", group: "Body", label: "Meals eaten (count only, no calories)", type: "count", target: 6 },
  { id: "fruit", cadence: "daily", group: "Body", label: "+1 fruit", type: "check" },
  { id: "vegetable", cadence: "daily", group: "Body", label: "+1 vegetable", type: "check" },

  // Lymph
  { id: "water_wake", cadence: "daily", group: "Lymph", label: "Glass of water on waking", type: "check" },
  { id: "lymph_massage", cadence: "daily", group: "Lymph", label: "5-min self-massage", type: "check", plannedMinutes: 5 },

  // Posture
  { id: "posture", cadence: "daily", group: "Posture", label: "Posture: chin tucks, wall angels, rows", type: "check", plannedMinutes: 10 },

  // Hair
  { id: "hair_moisturize", cadence: "daily", group: "Hair", label: "Moisturize hair", type: "check",
    notes: [{ to: "2026-11-13", text: "No irreversible hair moves before Nov 14." }] },
  { id: "scalp_massage", cadence: "daily", group: "Hair", label: "4-min scalp massage", type: "check", plannedMinutes: 4 },

  // Sleep and rest
  { id: "bed_on_time", cadence: "daily", group: "Sleep and rest", label: "In bed on time, early, when tired", type: "check" },
  { id: "nap", cadence: "daily", group: "Sleep and rest", label: "20-min nap if needed", type: "check", optional: true },

  // Mind
  { id: "journal", cadence: "daily", group: "Mind", label: "Journal (10 min, includes shadow work)", type: "check", plannedMinutes: 10 },
  { id: "reading", cadence: "daily", group: "Mind", label: "Read", type: "check" },
  { id: "mirror", cadence: "daily", group: "Mind", label: "2-min mirror practice: observe, then one true compliment", type: "check", plannedMinutes: 2 },

  // Growth
  { id: "learning", cadence: "daily", group: "Growth", label: "Learn a new skill", type: "minutes", target: 60, plannedMinutes: 60 },
  { id: "hobby_skills", cadence: "daily", group: "Growth", label: "Hobby: skills", type: "minutes", target: 15, plannedMinutes: 15, window: "AM" },
  { id: "hobby_intellect", cadence: "daily", group: "Growth", label: "Hobby: intellect", type: "minutes", target: 15, plannedMinutes: 15, window: "PM" },
  { id: "funding", cadence: "daily", group: "Growth", label: "20 min on the business", type: "minutes", target: 20, plannedMinutes: 20,
    phases: [
      { from: "2026-10-04", to: "2026-11-13", label: "20 min on the business: revise and prepare" },
      { from: "2026-11-14", label: "20 min on the business: submit and pitch" }
    ] },

  // Content
  { id: "content_tiktok", cadence: "daily", group: "Content", label: "TikTok", type: "minutes", target: 30, plannedMinutes: 30 },
  { id: "content_pinterest", cadence: "daily", group: "Content", label: "Business Pinterest page", type: "minutes", target: 30, plannedMinutes: 30 },

  // Screen
  { id: "doomscroll", cadence: "daily", group: "Screen", label: "Doomscrolling (minutes, cap 20)", type: "limit", limit: 20 },

  // Additional daily self-development and self-care habits
  { id: "affirmations", cadence: "daily", group: "Mind", label: "Affirmations", type: "check" },
  { id: "prayers", cadence: "daily", group: "Mind", label: "Prayers", type: "check" },
  { id: "dream_visualization", cadence: "daily", group: "Mind", label: "Dream day visualization", type: "check" },
  { id: "daily_solitude", cadence: "daily", group: "Mind", label: "Daily Solitude: 15 minutes in total silence, without screens, music, or distraction", type: "check" },
  { id: "dry_brushing", cadence: "daily", group: "Lymph", label: "Dry brushing", type: "check" },
  { id: "nail_care", cadence: "daily", group: "Self-care", label: "Nail care", type: "check" },
  { id: "pelvic_vacuum", cadence: "daily", group: "Body", label: "Pelvic Floor & Vacuum Ab Exercise: stomach vacuums while exhaling", type: "check" },
  { id: "herbal_tea", cadence: "daily", group: "Body", label: "Herbal tea", type: "check" },
  { id: "raw_carrot_salad", cadence: "daily", group: "Body", label: "Raw Carrot Salad", type: "check" },
  { id: "playing_chess", cadence: "daily", group: "Growth", label: "Playing chess", type: "check" },

  // ---------- WEEKLY ----------
  { id: "w_strength", cadence: "weekly", group: "Body", label: "3 strength sessions", type: "derived", target: 3,
    source: { from: "exercise", where: { type: "Strength" }, count: "entries" } },
  { id: "w_epsom_sauna", cadence: "weekly", group: "Lymph", label: "1 epsom bath or sauna", type: "check" },
  { id: "w_posture_photo", cadence: "weekly", group: "Posture", label: "Side-profile photo to compare", type: "check" },
  { id: "w_hair_wash", cadence: "weekly", group: "Hair", label: "Wash hair", type: "check" },
  { id: "w_hair_condition", cadence: "weekly", group: "Hair", label: "Deep condition or protective care", type: "check",
    notes: [{ to: "2026-11-13", text: "No irreversible hair moves before Nov 14." }] },
  { id: "w_sleep_avg", cadence: "weekly", group: "Sleep and rest", label: "7+ hours average sleep", type: "derived", target: 7,
    source: { from: "measure", field: "sleepHours", aggregate: "average" } },
  { id: "w_energy_notes", cadence: "weekly", group: "Food", label: "Energy levels this week", type: "derived",
    source: { from: "measure", field: "energy", aggregate: "average" } },
  { id: "w_journal_reread", cadence: "weekly", group: "Mind", label: "Reread one journal entry", type: "check" },
  { id: "w_shadow_prompt", cadence: "weekly", group: "Mind", label: "One prompt from the ledger, answered in full", type: "check" },
  { id: "w_hobby_skills", cadence: "weekly", group: "Growth", label: "3 skills hobby sessions", type: "derived", target: 3,
    source: { from: "habit", id: "hobby_skills", count: "daysAbove", value: 0 } },
  { id: "w_hobby_intellect", cadence: "weekly", group: "Growth", label: "3 intellect hobby sessions", type: "derived", target: 3,
    source: { from: "habit", id: "hobby_intellect", count: "daysAbove", value: 0 } },
  { id: "w_funding_action", cadence: "weekly", group: "Growth", label: "One application or one ask", type: "check" },
  { id: "w_linkedin_posts", cadence: "weekly", group: "Content", label: "LinkedIn posts scheduled", type: "count", target: 4 },
  { id: "w_job_win", cadence: "weekly", group: "Job", label: "One thing done visibly well", type: "check" },
  { id: "w_everything_shower", cadence: "weekly", group: "Self-care", label: 'The "Everything Shower" Ritual', type: "check" },
  { id: "w_salt_bath", cadence: "weekly", group: "Self-care", label: "Salt Baths for Energy Cleansing", type: "check" },
  { id: "w_self_care_day", cadence: "weekly", group: "Self-care", label: "Self-care day", type: "check" }
];

// ---------- helpers ----------

// ISO dates (YYYY-MM-DD) compare correctly as plain strings.
function inRange(date, from, to) {
  return (!from || date >= from) && (!to || date <= to);
}

function dailyHabits() { return HABITS.filter(h => h.cadence === "daily"); }
function weeklyHabits() { return HABITS.filter(h => h.cadence === "weekly"); }
function habitById(id) { return HABITS.find(h => h.id === id); }

// Label for a habit on a given date (phases can change the wording).
function labelOn(habit, date) {
  const phase = (habit.phases || []).find(p => inRange(date, p.from, p.to));
  return phase ? phase.label : habit.label;
}

// Active reminder texts for a habit on a given date.
function notesOn(habit, date) {
  return (habit.notes || []).filter(n => inRange(date, n.from, n.to)).map(n => n.text);
}

// Planned minutes for the day, and whether it trips the time flag.
function plannedMinutes() {
  return dailyHabits().reduce((sum, h) => sum + (h.plannedMinutes || 0), 0);
}
function timeFlagged() {
  return plannedMinutes() > CONFIG.timeFlag.warnAboveMinutes;
}

// A blank day record. check -> false, everything numeric -> null (null = not logged yet).
function emptyDay(date) {
  const habits = {};
  dailyHabits().forEach(h => { habits[h.id] = h.type === "check" ? false : null; });
  return {
    date,
    state: null,                 // set to "heavy" manually; all other states are computed
    habits,
    exercise: [],                // [{ type, minutes, startTime }]
    measures: { weight: null, mood: "", energy: null, sleepHours: null, bedtime: "", notes: "" },
    reflection: { wentWell: "", challenge: "", tomorrow: "" }
  };
}

function isDone(habit, value) {
  if (habit.type === "check") return value === true;
  if (habit.type === "limit") return value !== null && value <= habit.limit;
  if (habit.type === "minutes" || habit.type === "count") return value !== null && value >= habit.target;
  return false;
}

function minimumMet(day) {
  return MINIMUM.every(m => {
    const v = day.habits[m.id];
    return typeof v === "number" ? v >= (m.atLeast || 1) : v === true;
  });
}

function allDone(day) {
  return dailyHabits().filter(h => !h.optional).every(h => isDone(h, day.habits[h.id]));
}

// "heavy" | "full" | "minimum" | "open"
function dayStatus(day) {
  if (day.state === "heavy") return "heavy";
  if (allDone(day)) return "full";
  if (minimumMet(day)) return "minimum";
  return "open";
}

function showedUp(day) {
  return CONFIG.dayStates[dayStatus(day)].showedUp;
}

// CSV column order. Daily CSV = one row per day. Weekly CSV = one row per week.
function dailyCsvColumns() {
  return ["date", "status"]
    .concat(dailyHabits().map(h => h.id))
    .concat(["exercise", "weight", "mood", "energy", "sleep_hours", "bedtime", "notes", "planned_minutes", "reflection_went_well", "reflection_challenge", "reflection_tomorrow"]);
}
function weeklyCsvColumns() {
  return ["week_start"].concat(weeklyHabits().map(h => h.id));
}

if (typeof module !== "undefined") {
  module.exports = {
    CONFIG, MINIMUM, HABITS, inRange, dailyHabits, weeklyHabits, habitById, labelOn, notesOn,
    plannedMinutes, timeFlagged, emptyDay, isDone, minimumMet, allDone, dayStatus, showedUp,
    dailyCsvColumns, weeklyCsvColumns
  };
}