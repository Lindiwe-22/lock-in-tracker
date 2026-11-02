"use strict";

/*
  Lock-In Tracker - CSV export and import (step 3)

  CSVTools.toCsv(days)    array of day records -> CSV text (daily file, one row per day)
  CSVTools.parseCsv(text) CSV text -> { days, errors }
  CSVTools.isBlank(day)   true when a parsed day carries no information

  Columns come from dailyCsvColumns() in config.js, so a new habit appears in the
  CSV with no change here. Unknown columns in an imported file are ignored.
*/

const CSVTools = (function () {
  const C = (typeof module !== "undefined" && typeof require === "function")
    ? require("./config.js")
    : { dailyHabits, weeklyHabits, emptyDay, dayStatus, plannedMinutes, dailyCsvColumns, weeklyCsvColumns };

  // Spreadsheet formula guard: text starting with = + - @ gets a leading apostrophe on
  // export and loses it on import, so a round trip returns exactly what you typed.
  const RISK = /^[=+\-@\t\r]/;
  const safeOut = s => { s = String(s == null ? "" : s); return RISK.test(s) ? "'" + s : s; };
  const safeIn = s => /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;

  const cell = v => {
    const s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const nz = v => (v == null || v === "") ? "" : v;

  // exercise: "Strength:30@07:30;Cardio:20@"
  function encodeExercise(list) {
    return (list || []).map(e =>
      `${String(e.type).replace(/[;:@]/g, " ")}:${Number(e.minutes) || 0}@${e.startTime || ""}`).join(";");
  }
  function decodeExercise(s) {
    return s.split(";").map(x => x.trim()).filter(Boolean).map(x => {
      const m = /^(.*?):(\d+(?:\.\d+)?)@(.*)$/.exec(x);
      return m ? { type: m[1].trim() || "Other", minutes: Number(m[2]), startTime: m[3].trim() } : null;
    }).filter(Boolean);
  }

  // ---------- export ----------
  function toCsv(days) {
    const cols = C.dailyCsvColumns();
    const habitIds = new Set(C.dailyHabits().map(h => h.id));
    const rows = days.map(day => {
      const m = day.measures || {}, r = day.reflection || {};
      return cols.map(col => {
        if (col === "date") return day.date;
        if (col === "status") return C.dayStatus(day);
        if (habitIds.has(col)) { const v = day.habits[col]; return typeof v === "boolean" ? (v ? 1 : 0) : nz(v); }
        switch (col) {
          case "exercise": return safeOut(encodeExercise(day.exercise));
          case "weight": return nz(m.weight);
          case "mood": return safeOut(m.mood);
          case "energy": return nz(m.energy);
          case "sleep_hours": return nz(m.sleepHours);
          case "bedtime": return m.bedtime || "";
          case "notes": return safeOut(m.notes);
          case "planned_minutes": return C.plannedMinutes();
          case "reflection_went_well": return safeOut(r.wentWell);
          case "reflection_challenge": return safeOut(r.challenge);
          case "reflection_tomorrow": return safeOut(r.tomorrow);
          default: return "";
        }
      }).map(cell).join(",");
    });
    return "\uFEFF" + [cols.join(",")].concat(rows).join("\r\n") + "\r\n";
  }

  // ---------- import ----------
  function parseRows(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(f); f = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; rows.push(row); row = []; }
      else f += ch;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ""));
  }

  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

  function parseCsv(text) {
    const errors = [], byDate = new Map();
    const rows = parseRows(String(text).replace(/^\uFEFF/, ""));
    if (!rows.length) return { days: [], errors: ["The file is empty."] };
    const header = rows[0].map(c => c.trim());
    const idx = {}; header.forEach((c, i) => { idx[c] = i; });
    if (!("date" in idx)) return { days: [], errors: ["No date column found. Is this a Lock-In export?"] };
    const err = msg => { if (errors.length < 5) errors.push(msg); };

    rows.slice(1).forEach((r, n) => {
      const get = col => (col in idx && idx[col] < r.length) ? r[idx[col]] : "";
      const num = (col, raw) => {
        if (raw.trim() === "") return null;
        const v = Number(raw);
        if (!isFinite(v)) { err(`Row ${n + 2}: "${raw}" in ${col} is not a number, left blank.`); return null; }
        return v;
      };
      const date = get("date").trim();
      if (!validDate(date)) { err(`Row ${n + 2}: skipped, "${date}" is not a valid date (YYYY-MM-DD).`); return; }

      const day = C.emptyDay(date);
      C.dailyHabits().forEach(h => {
        if (!(h.id in idx)) return;
        const raw = get(h.id);
        day.habits[h.id] = h.type === "check" ? /^(1|true|yes|y|x)$/i.test(raw.trim()) : num(h.id, raw);
      });
      if (get("status").trim().toLowerCase() === "heavy") day.state = "heavy";
      day.exercise = decodeExercise(safeIn(get("exercise")));
      day.measures.weight = num("weight", get("weight"));
      day.measures.mood = safeIn(get("mood"));
      day.measures.energy = num("energy", get("energy"));
      day.measures.sleepHours = num("sleep_hours", get("sleep_hours"));
      day.measures.bedtime = get("bedtime").trim();
      day.measures.notes = safeIn(get("notes"));
      day.reflection = {
        wentWell: safeIn(get("reflection_went_well")),
        challenge: safeIn(get("reflection_challenge")),
        tomorrow: safeIn(get("reflection_tomorrow"))
      };
      byDate.set(date, day);          // a later row for the same date wins
    });
    return { days: [...byDate.values()], errors };
  }

  function isBlank(day) {
    return JSON.stringify(day) === JSON.stringify(C.emptyDay(day.date));
  }

  // ---------- weekly (step 4) ----------
  function toWeeklyCsv(rows) {
    const cols = C.weeklyCsvColumns();
    const lines = rows.map(r => cols.map(col => {
      if (col === "week_start") return r.week_start;
      const v = r.values[col];
      return v == null ? "" : (typeof v === "boolean" ? (v ? 1 : 0) : v);
    }).map(cell).join(","));
    return "\uFEFF" + [cols.join(",")].concat(lines).join("\r\n") + "\r\n";
  }

  // Only manual items are read back. Derived columns are recomputed from the daily log.
  function parseWeeklyCsv(text) {
    const errors = [], byWeek = new Map();
    const rows = parseRows(String(text).replace(/^\uFEFF/, ""));
    if (!rows.length) return { weeks: [], errors: ["The file is empty."] };
    const idx = {}; rows[0].map(c => c.trim()).forEach((c, i) => { idx[c] = i; });
    if (!("week_start" in idx)) return { weeks: [], errors: ["No week_start column found. Is this a weekly Lock-In export?"] };
    rows.slice(1).forEach((r, n) => {
      const date = (r[idx.week_start] || "").trim();
      if (!validDate(date)) { if (errors.length < 5) errors.push(`Row ${n + 2}: skipped, "${date}" is not a valid date.`); return; }
      const habits = {};
      C.weeklyHabits().filter(h => h.type !== "derived" && h.id in idx).forEach(h => {
        const raw = (idx[h.id] < r.length ? r[idx[h.id]] : "").trim();
        habits[h.id] = h.type === "check" ? /^(1|true|yes|y|x)$/i.test(raw) : (raw === "" || !isFinite(Number(raw)) ? null : Number(raw));
      });
      byWeek.set(date, { weekStart: date, habits });
    });
    return { weeks: [...byWeek.values()], errors };
  }

  return { toCsv, parseCsv, isBlank, toWeeklyCsv, parseWeeklyCsv };
})();

if (typeof module !== "undefined") module.exports = CSVTools;