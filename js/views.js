"use strict";

/*
  Lock-In Tracker - week view, block view, weekly CSV (step 4)

  Views.tabs(active)        tab bar HTML (Day | Week | Block)
  Views.render(view, ctx)   draws the Week or Block view into ctx.app
  Views.init(ctx)           attaches the click and change handlers once

  Weekly records live in data.weeks[weekStart] = { habits: { id: value } }.
  Only manual weekly items are stored. Derived items (strength sessions, hobby
  sessions, average sleep and energy) are computed from the daily records.
*/

const Views = (function () {
  const C = (typeof module !== "undefined" && typeof require === "function")
    ? require("./config.js")
    : { CONFIG, dailyHabits, weeklyHabits, dayStatus, showedUp, notesOn };

  // ---------- small helpers ----------
  const parts = s => s.split("-").map(Number);
  const addDays = (s, n) => { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const diffDays = (a, b) => { const f = s => { const [y, m, d] = parts(s); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 864e5); };
  const endDate = s => { const [y, m, d] = parts(s); return addDays(new Date(Date.UTC(y, m - 1 + C.CONFIG.trackerMonths, d)).toISOString().slice(0, 10), -1); };
  const weekStart = s => { const [y, m, d] = parts(s); const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(s, -((dow - C.CONFIG.weekStartsOn + 7) % 7)); };
  const weekDates = ws => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(ws, i));
  const clamp = (s, lo, hi) => (s < lo ? lo : s > hi ? hi : s);
  const earlier = (a, b) => (a < b ? a : b);
  const esc = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length * 10) / 10 : null;
  const fmtMin = m => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${r}m` : `${r}m`; };
  const short = s => { const [y, m, d] = parts(s); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };
  const dayMinutes = day =>
    C.dailyHabits().reduce((s, h) => s + (h.type === "minutes" ? (day.habits[h.id] || 0) : 0), 0) +
    (day.exercise || []).reduce((s, e) => s + (Number(e.minutes) || 0), 0);

  // ---------- weekly values and report (pure) ----------
  function weeklyValue(h, dates, getDay, week) {
    if (h.type !== "derived") {
      const v = week && week.habits ? week.habits[h.id] : undefined;
      return h.type === "check" ? v === true : (v == null ? null : v);
    }
    const s = h.source, days = dates.map(getDay);
    if (s.from === "exercise") return days.reduce((n, d) => n + (d.exercise || []).filter(e => e.type === s.where.type).length, 0);
    if (s.from === "habit") return days.filter(d => (d.habits[s.id] || 0) > s.value).length;
    if (s.from === "measure") return avg(days.map(d => d.measures[s.field]).filter(x => x != null));
    return null;
  }
  function weeklyDone(h, v) {
    if (h.type === "check") return v === true;
    return h.target != null && v != null && v >= h.target;
  }
  function weekReport(ws, getDay, week, win) {
    const dates = weekDates(ws).filter(x => x >= win.start && x <= win.end && x <= win.today);
    const days = dates.map(getDay);
    const counts = { full: 0, minimum: 0, heavy: 0, open: 0 };
    days.forEach(d => { counts[C.dayStatus(d)]++; });
    const weights = days.map(d => d.measures.weight).filter(x => x != null);
    const moods = {};
    days.forEach(d => { if (d.measures.mood) moods[d.measures.mood] = (moods[d.measures.mood] || 0) + 1; });
    let hit = 0, total = 0;
    C.weeklyHabits().forEach(h => {
      if (!(h.type === "check" || h.target != null)) return;
      total++;
      if (weeklyDone(h, weeklyValue(h, dates, getDay, week))) hit++;
    });
    return {
      elapsed: dates.length, shown: days.filter(d => C.showedUp(d)).length, counts,
      minutes: days.reduce((s, d) => s + dayMinutes(d), 0),
      sleep: avg(days.map(d => d.measures.sleepHours).filter(x => x != null)),
      energy: avg(days.map(d => d.measures.energy).filter(x => x != null)),
      weightChange: weights.length > 1 ? Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10 : null,
      mood: Object.keys(moods).sort((a, b) => moods[b] - moods[a])[0] || null,
      hit, total
    };
  }

  // ---------- rendering ----------
  const state = { ws: null, block: null };

  function tabs(active) {
    return `<nav class="tabs" aria-label="Views">${["day", "week", "block"].map(v =>
      `<button type="button" data-view="${v}"${v === active ? ' aria-current="page"' : ""}>${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</nav>`;
  }

  function renderWeek(ctx) {
    const d = ctx.data, start = d.startDate, end = endDate(start), t = ctx.today();
    if (!state.ws) state.ws = weekStart(clamp(t, start, end));
    const ws = state.ws, week = (d.weeks || {})[ws];
    const dates = weekDates(ws).filter(x => x >= start && x <= end && x <= t);
    const r = weekReport(ws, ctx.getDay, week, { start, end, today: t });
    const groups = [...new Set(C.weeklyHabits().map(h => h.group))];

    const row = h => {
      const v = weeklyValue(h, dates, ctx.getDay, week), done = weeklyDone(h, v);
      const notes = (C.notesOn(h, addDays(ws, 6)) || []).map(x => `<small class="note">${esc(x)}</small>`).join("");
      if (h.type === "check") return `<label class="row"><input type="checkbox" data-w="${h.id}" ${v ? "checked" : ""}><span>${esc(h.label)}${notes}</span></label>`;
      if (h.type === "count") return `<div class="row num"><span>${esc(h.label)}<small>Goal ${h.target}</small></span><input type="number" min="0" inputmode="numeric" data-w="${h.id}" aria-label="${esc(h.label)}" value="${v ?? ""}"></div>`;
      const shown = v == null ? "No data yet" : v + (h.target != null ? ` of ${h.target}` : "");
      return `<div class="row"><span>${esc(h.label)}<small>${shown}${done ? ". Done." : ""} Computed from your daily log.</small></span></div>`;
    };

    ctx.app.innerHTML = `
      <h1>${esc(C.CONFIG.appName)}</h1>${Affirmations.line()}${tabs("week")}
      <div class="nav">
        <button data-wnav="-1" aria-label="Previous week">&lsaquo;</button>
        <div class="date"><strong>${short(ws)} to ${short(addDays(ws, 6))}</strong><small>${ws === weekStart(clamp(t, start, end)) ? "This week" : "Week of " + ws}</small></div>
        <button data-wnav="1" aria-label="Next week">&rsaquo;</button>
      </div>
      <section class="band" aria-label="Weekly report">
        <strong>Weekly report</strong>
        Showed up ${r.shown} of ${r.elapsed} days. Full ${r.counts.full}, Minimum ${r.counts.minimum}, Heavy ${r.counts.heavy}, Open ${r.counts.open}.
        <small style="display:block;margin-top:6px">Weekly targets hit: ${r.hit} of ${r.total}. Time logged: ${fmtMin(r.minutes)}.</small>
        <small style="display:block">Sleep average: ${r.sleep ?? "no data"}${r.sleep != null ? " h" : ""}. Energy average: ${r.energy ?? "no data"}. Most frequent mood: ${esc(r.mood || "no data")}.</small>
        <small style="display:block">Weight change: ${r.weightChange == null ? "needs two weigh-ins" : (r.weightChange > 0 ? "+" : "") + r.weightChange + " kg"}.</small>
      </section>
      ${groups.map(g => `<h2>${esc(g)}</h2>` + C.weeklyHabits().filter(h => h.group === g).map(row).join("")).join("")}
      <details><summary>Weekly CSV</summary>
        <button type="button" id="wk-export">Export weekly CSV</button>
        <button type="button" id="wk-import">Import weekly CSV</button>
        <input type="file" id="wk-file" accept=".csv,text/csv" hidden>
      </details>`;
  }

  function renderBlock(ctx) {
    const d = ctx.data, start = d.startDate, end = endDate(start), t = ctx.today(), B = C.CONFIG.blockDays;
    const total = diffDays(start, end) + 1, nBlocks = Math.ceil(total / B);
    if (state.block == null) state.block = Math.min(nBlocks - 1, Math.max(0, Math.floor(diffDays(start, clamp(t, start, end)) / B)));
    const b = state.block, from = b * B, to = Math.min(from + B, total);
    const counts = { full: 0, minimum: 0, heavy: 0, open: 0 };
    let shown = 0, elapsed = 0, cells = "";
    for (let i = from; i < to; i++) {
      const date = addDays(start, i), future = date > t;
      const status = future ? "future" : C.dayStatus(ctx.getDay(date));
      if (!future) { counts[status]++; elapsed++; if (C.CONFIG.dayStates[status].showedUp) shown++; }
      cells += `<button type="button" class="cell ${status}${date === t ? " today" : ""}" data-goto="${date}" aria-label="Day ${i + 1}, ${short(date)}, ${status}">${i + 1}</button>`;
    }
    ctx.app.innerHTML = `
      <h1>${esc(C.CONFIG.appName)}</h1>${Affirmations.line()}${tabs("block")}
      <div class="nav">
        <button data-bnav="-1" aria-label="Previous block">&lsaquo;</button>
        <div class="date"><strong>Block ${b + 1} of ${nBlocks}</strong><small>Days ${from + 1} to ${to}, ${short(addDays(start, from))} to ${short(addDays(start, to - 1))}</small></div>
        <button data-bnav="1" aria-label="Next block">&rsaquo;</button>
      </div>
      <section class="band" aria-label="Block summary">
        <strong>${shown} of ${elapsed} days shown up</strong>
        Full ${counts.full}, Minimum ${counts.minimum}, Heavy ${counts.heavy}, Open ${counts.open}.
      </section>
      <div class="cells">${cells}</div>
      <p class="legend"><small><i class="l-full"></i>Full</small><small><i class="l-minimum"></i>Minimum</small><small><i class="l-heavy"></i>Heavy</small><small><i class="l-open"></i>Open</small><small>Tap a day to open it. Today has an outline.</small></p>`;
  }

  function render(view, ctx) { return view === "block" ? renderBlock(ctx) : renderWeek(ctx); }

  // ---------- weekly CSV wiring ----------
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function weeklyRows(ctx) {
    const d = ctx.data, start = d.startDate, end = endDate(start), t = ctx.today(), rows = [];
    for (let ws = weekStart(start); ws <= weekStart(earlier(t, end)); ws = addDays(ws, 7)) {
      const dates = weekDates(ws).filter(x => x >= start && x <= end && x <= t), values = {};
      C.weeklyHabits().forEach(h => { values[h.id] = weeklyValue(h, dates, ctx.getDay, (d.weeks || {})[ws]); });
      rows.push({ week_start: ws, values });
    }
    return rows;
  }
  function exportWeekly(ctx) {
    const rows = weeklyRows(ctx);
    if (!rows.length) { ctx.toast("Nothing to export yet."); return; }
    download(`lock-in-weekly-${ctx.today()}.csv`, CSVTools.toWeeklyCsv(rows));
    ctx.toast(`Exported ${rows.length} weeks.`);
  }
  function importWeekly(ctx, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => ctx.toast("Could not read that file.");
    reader.onload = () => {
      const res = CSVTools.parseWeeklyCsv(String(reader.result));
      const start = ctx.data.startDate, end = endDate(start);
      const usable = res.weeks.filter(w => addDays(w.weekStart, 6) >= start && w.weekStart <= end &&
        Object.values(w.habits).some(v => v === true || (typeof v === "number")));
      if (!usable.length) { ctx.toast(res.errors[0] || "No weekly rows to import."); return; }
      const d = ctx.data; d.weeks = d.weeks || {};
      const replaced = usable.filter(w => d.weeks[w.weekStart]).length;
      if (replaced && !confirm(`This replaces ${replaced} week${replaced === 1 ? "" : "s"} already saved in this browser. Continue?`)) return;
      usable.forEach(w => { d.weeks[w.weekStart] = { habits: w.habits }; });
      ctx.save(); ctx.render();
      ctx.toast(`Imported ${usable.length} week${usable.length === 1 ? "" : "s"}.`);
    };
    reader.readAsText(file);
  }

  // ---------- events ----------
  function init(ctx) {
    ctx.app.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t) return;
      const start = ctx.data.startDate, end = start && endDate(start);
      if (t.dataset.view) { ctx.setView(t.dataset.view); }
      else if (t.dataset.wnav) {
        const next = t.dataset.wnav === "today" ? weekStart(clamp(ctx.today(), start, end)) : addDays(state.ws, 7 * Number(t.dataset.wnav));
        if (addDays(next, 6) < start || next > end) { ctx.toast("That week is outside your 12 months."); return; }
        state.ws = next; ctx.render();
      } else if (t.dataset.bnav) {
        const nBlocks = Math.ceil((diffDays(start, end) + 1) / C.CONFIG.blockDays), next = state.block + Number(t.dataset.bnav);
        if (next < 0 || next >= nBlocks) { ctx.toast("No more blocks that way."); return; }
        state.block = next; ctx.render();
      } else if (t.dataset.goto) { ctx.goDay(t.dataset.goto); }
      else if (t.id === "wk-export") exportWeekly(ctx);
      else if (t.id === "wk-import") document.getElementById("wk-file").click();
    });
    ctx.app.addEventListener("change", e => {
      const t = e.target;
      if (t.dataset && t.dataset.w) {
        const d = ctx.data; d.weeks = d.weeks || {};
        const rec = d.weeks[state.ws] || { habits: {} };
        rec.habits[t.dataset.w] = t.type === "checkbox" ? t.checked : (t.value === "" ? null : Number(t.value));
        d.weeks[state.ws] = rec; ctx.save(); ctx.render();
      } else if (t.id === "wk-file") { importWeekly(ctx, t.files[0]); t.value = ""; }
    });
  }

  return { tabs, render, init, weekStart, weekReport, weeklyValue, weeklyDone, weeklyRows };
})();

if (typeof module !== "undefined") module.exports = Views;
