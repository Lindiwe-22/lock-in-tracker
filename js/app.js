"use strict";

(function () {
  const app = document.getElementById("app");

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, "0");
  function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parts(s) { return s.split("-").map(Number); }
  function addDays(s, n) { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
  function diffDays(a, b) { const f = s => Date.UTC(...parts(s).map((v, i) => i === 1 ? v - 1 : v)); return Math.round((f(b) - f(a)) / 864e5); }
  function endDate(start) { const [y, m, d] = parts(start); return addDays(new Date(Date.UTC(y, m - 1 + CONFIG.trackerMonths, d)).toISOString().slice(0, 10), -1); }
  function pretty(s) { const [y, m, d] = parts(s); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }); }
  function weekStart(date) {
    const [y, m, d] = parts(date);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return addDays(date, -((weekday - CONFIG.weekStartsOn + 7) % 7));
  }

  const esc = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function fmtMin(m) { const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${r}m` : `${r}m`; }

  // Initialise application state after date utilities.
  let data = Store.load();
  let current = today();
  let view = "day";

  // ---------- data ----------
  function getDay(date) {
    const base = emptyDay(date), s = data.days[date];
    if (!s) return base;
    return Object.assign(base, s, {
      habits: Object.assign(base.habits, s.habits),
      measures: Object.assign(base.measures, s.measures),
      reflection: Object.assign({}, base.reflection || {}, s.reflection || {}),
      exercise: s.exercise || []
    });
  }
  function saveDay(day) {
    data.days[day.date] = day;
    if (!Store.save(data)) toast("Could not save. Browser storage may be full or blocked.");
  }
  function toast(msg) {
    const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ---------- derived numbers ----------
  function loggedMinutes(day) {
    const fromHabits = dailyHabits().reduce((s, h) => s + (h.type === "minutes" ? (day.habits[h.id] || 0) : 0), 0);
    return fromHabits + day.exercise.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
  }
  function consistency() {
    const last = [today(), endDate(data.startDate)].sort()[0];
    const total = Math.max(0, diffDays(data.startDate, last) + 1);
    let shown = 0;
    for (let i = 0; i < total; i++) if (showedUp(getDay(addDays(data.startDate, i)))) shown++;
    return { shown, total };
  }

  function consistencyInsights() {
    const last = [today(), endDate(data.startDate)].sort()[0];
    const total = Math.max(0, diffDays(data.startDate, last) + 1);

    const counts = { full: 0, minimum: 0, heavy: 0, open: 0 };
    let shown = 0;
    let reflections = 0;

    for (let i = 0; i < total; i++) {
      const day = getDay(addDays(data.startDate, i));
      const status = dayStatus(day);

      counts[status]++;
      if (showedUp(day)) shown++;

      const r = day.reflection || {};
      if ([r.wentWell, r.challenge, r.tomorrow].every(
        value => typeof value === "string" && value.trim().length > 0
      )) reflections++;
    }

    function recent(days) {
      let available = 0;
      let recentShown = 0;

      for (let i = 0; i < days; i++) {
        const date = addDays(last, -i);
        if (date < data.startDate) continue;

        available++;
        if (showedUp(getDay(date))) recentShown++;
      }

      return {
        shown: recentShown,
        total: available,
        percent: available ? Math.round(recentShown / available * 100) : 0
      };
    }

    return {
      shown,
      total,
      percent: total ? Math.round(shown / total * 100) : 0,
      counts,
      reflections,
      last7: recent(7),
      last30: recent(30)
    };
  }
  function blockProgress(dayNumber, trackerTotal) {
    const blockNumber = Math.floor((dayNumber - 1) / CONFIG.blockDays) + 1;
    const blockStart = (blockNumber - 1) * CONFIG.blockDays + 1;
    const blockEnd = Math.min(blockNumber * CONFIG.blockDays, trackerTotal);
    const blockLength = blockEnd - blockStart + 1;
    const elapsedDays = Math.min(dayNumber, blockEnd) - blockStart + 1;

    let shown = 0;
    for (let i = 0; i < elapsedDays; i++) {
      const date = addDays(data.startDate, blockStart - 1 + i);
      if (showedUp(getDay(date))) shown++;
    }

    return {
      number: blockNumber,
      totalBlocks: Math.ceil(trackerTotal / CONFIG.blockDays),
      day: dayNumber - blockStart + 1,
      length: blockLength,
      elapsedDays,
      shown,
      percent: Math.round((elapsedDays / blockLength) * 100),
      completed: blockLength === CONFIG.blockDays && elapsedDays === blockLength
    };
  }

  const MILESTONES = [7, 30, 50, 75, 100, 150, 225, 300];

  const STATUS_TEXT = {
    full: ["Full day", "Everything done."],
    minimum: ["Minimum met", "This counts. The rest is a bonus."],
    heavy: ["Heavy day", "Held on a heavy day. This counts."],
    open: ["Open", "Nothing is lost. Fill in what you can."]
  };

  // ---------- render ----------
  function render() {
    if (!data.startDate) return renderSetup();
    if (view !== "day") return Views.render(view, viewCtx);
    const day = getDay(current), end = endDate(data.startDate);
    const thisWeekStart = weekStart(current);
    const weeklyValues = data.weeks[thisWeekStart] || {};
    const newWeeklyHabits = weeklyHabits().filter(h =>
      ["w_everything_shower", "w_salt_bath"].includes(h.id)
    );
    const n = diffDays(data.startDate, current) + 1, total = diffDays(data.startDate, end) + 1;
    const block = n >= 1 && n <= total ? blockProgress(n, total) : null;
    const progress = consistency();
    const insights = consistencyInsights();
    const achievedMilestones = MILESTONES.filter(target => progress.shown >= target);
    const nextMilestone = MILESTONES.find(target => progress.shown < target);
    let where;
    if (n < 1) where = `Starts in ${1 - n} day${n === 0 ? "" : "s"}`;
    else if (n > total) where = "Tracker year complete";
    else where = `Day ${n} of ${total}. Block ${block.number} of ${block.totalBlocks}, day ${block.day} of ${block.length}`;

    const groups = [...new Set(dailyHabits().map(h => h.group))];
    app.innerHTML = `
      <h1>${esc(CONFIG.appName)}</h1>
      ${Affirmations.line()}
      ${Views.tabs("day")}
      <div class="nav">
        <button data-nav="-1" aria-label="Previous day">&lsaquo;</button>
        <div class="date"><strong>${pretty(current)}</strong><small>${where}</small></div>
        <button data-nav="1" aria-label="Next day">&rsaquo;</button>
      </div>
      ${current !== today() ? '<button data-nav="today">Go to today</button>' : ""}
      ${block ? `
        <section class="block-progress" aria-label="75-day block progress">
          <strong>Block ${block.number} of ${block.totalBlocks}</strong>
          <div>Day ${block.day} of ${block.length}</div>
          <progress max="${block.length}" value="${block.elapsedDays}" aria-label="${block.percent}% of block elapsed"></progress>
          <small>${block.elapsedDays} of ${block.length} days elapsed (${block.percent}%).</small>
          <small>Showed up ${block.shown} of ${block.elapsedDays} elapsed days.</small>
          ${block.completed ? "<strong>75-day block complete!</strong>" : ""}
        </section>
      ` : ""}
      <section class="milestones" aria-label="Cumulative show-up milestones">
        <strong>Consistency milestones</strong>
        <div>${achievedMilestones.length} of ${MILESTONES.length} milestones reached</div>
        <small>
          ${achievedMilestones.length
            ? "Achieved: " + achievedMilestones.map(m => m + " days").join(", ") + "."
            : "Your first milestone is 7 cumulative show-up days."}
        </small>
        <small>
          ${nextMilestone
            ? "Next milestone: " + nextMilestone + " days. " + (nextMilestone - progress.shown) + " more show-up days to go."
            : "All consistency milestones achieved. Excellent work!"}
        </small>
      </section>
      <section class="consistency-insights" aria-label="Consistency insights">
        <strong>Consistency insights</strong>
        <div>Overall show-up rate: ${insights.percent}% (${insights.shown} of ${insights.total} days)</div>
        <div>Last 7 days: ${insights.last7.shown} of ${insights.last7.total} days (${insights.last7.percent}%)</div>
        <div>Last 30 days: ${insights.last30.shown} of ${insights.last30.total} days (${insights.last30.percent}%)</div>
        <small>Full: ${insights.counts.full} · Minimum: ${insights.counts.minimum} · Heavy: ${insights.counts.heavy} · Open: ${insights.counts.open}</small>
        <small style="display:block">Completed all three reflections: ${insights.reflections} of ${insights.total} days</small>
      </section>
      <div class="band" id="band"></div>
      <label class="heavy-toggle"><input type="checkbox" id="heavy" ${day.state === "heavy" ? "checked" : ""}>
        <span>Heavy day. Mark it and it still counts.</span></label>
      ${groups.map(g => `<h2>${esc(g)}</h2>` + dailyHabits().filter(h => h.group === g).map(h => row(h, day)).join("")).join("")}
      <section class="weekly-rituals" aria-label="Weekly rituals">
        <h2>Weekly rituals</h2>
        <small class="muted">Week beginning ${pretty(thisWeekStart)}</small>
        ${newWeeklyHabits.map(h => `<label class="row"><input type="checkbox" data-weekly="${h.id}" ${weeklyValues[h.id] ? "checked" : ""}><span>${esc(labelOn(h, current))}</span></label>`).join("")}
      </section>
      <h2>Exercise log</h2>
      <div class="ex-add">
        <select id="ex-type" aria-label="Exercise type">${CONFIG.exerciseTypes.map(t => `<option>${esc(t)}</option>`).join("")}</select>
        <input id="ex-min" type="number" min="1" inputmode="numeric" placeholder="min" aria-label="Minutes">
        <input id="ex-start" type="time" aria-label="Start time">
        <button type="button" id="ex-add">Add exercise</button>
      </div>
      <div id="ex-list"></div>
      <h2>Check-in</h2>
      <div class="grid">
        <label>Weight (kg)<input data-m="weight" type="number" step="0.1" inputmode="decimal" value="${day.measures.weight ?? ""}"></label>
        <label>Mood<select data-m="mood"><option value=""></option>${CONFIG.moods.map(m => `<option ${day.measures.mood === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label>
        <label>Energy (${CONFIG.energyScale[0]} to ${CONFIG.energyScale[1]})<input data-m="energy" type="number" min="${CONFIG.energyScale[0]}" max="${CONFIG.energyScale[1]}" inputmode="numeric" value="${day.measures.energy ?? ""}"></label>
        <label>Sleep (hours)<input data-m="sleepHours" type="number" step="0.5" min="0" max="24" inputmode="decimal" value="${day.measures.sleepHours ?? ""}"></label>
        <label>Bedtime<input data-m="bedtime" type="time" value="${esc(day.measures.bedtime)}"></label>
      </div>
      <section class="reflection" aria-label="Daily reflection">
        <strong>Daily reflection:</strong><br>
        <label>What went well today?<textarea data-r="wentWell" placeholder="Record a win, however small...">${esc(day.reflection.wentWell)}</textarea></label>
        <label>What challenged me today?<textarea data-r="challenge" placeholder="What felt difficult?">${esc(day.reflection.challenge)}</textarea></label>
        <label>What will I focus on tomorrow?<textarea data-r="tomorrow" placeholder="Choose one thing to focus on...">${esc(day.reflection.tomorrow)}</textarea></label>
      </section>
      <textarea data-m="notes" placeholder="Notes for today" aria-label="Notes">${esc(day.measures.notes)}</textarea>
      <details><summary>Settings</summary>
        <label class="muted">Start date<br><input id="start-date" type="date" value="${data.startDate}"></label>
        <button type="button" id="start-save">Save start date</button>
        <button type="button" id="csv-export">Export CSV</button>
        <button type="button" id="csv-import">Import CSV</button>
        <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
      </details>`;
    renderExercise(day);
    updateSummary(day);
  }

  function row(h, day) {
    const v = day.habits[h.id], label = esc(labelOn(h, current));
    const notes = notesOn(h, current).map(t => `<small class="note">${esc(t)}</small>`).join("");
    const win = h.window ? `<em>${h.window}</em>` : "";
    if (h.type === "check") {
      return `<label class="row"><input type="checkbox" data-h="${h.id}" ${v ? "checked" : ""}><span>${label}${win}${h.optional ? "<em>optional</em>" : ""}${notes}</span></label>`;
    }
    const goal = h.type === "limit" ? `Cap ${h.limit}` : `Goal ${h.target}`;
    return `<div class="row num"><span>${label}${win}<small>${goal}</small>${notes}</span>
      <input type="number" min="0" inputmode="numeric" data-h="${h.id}" aria-label="${label}" value="${v ?? ""}">
      ${h.type === "limit" ? "" : `<button type="button" data-fill="${h.id}" aria-label="Set ${label} to goal">${h.target}</button>`}</div>`;
  }

  function renderExercise(day) {
    document.getElementById("ex-list").innerHTML = day.exercise.length
      ? day.exercise.map((e, i) => `<div class="ex-item"><span>${esc(e.type)}, ${esc(e.minutes)} min${e.startTime ? " at " + esc(e.startTime) : ""}</span><button type="button" data-ex-del="${i}" aria-label="Remove exercise">Remove</button></div>`).join("")
      : '<small class="muted">Nothing logged yet.</small>';
  }

  function updateSummary(day) {
    const status = dayStatus(day), [title, line] = STATUS_TEXT[status], c = consistency();
    const planned = plannedMinutes();
    const budget = CONFIG.timeFlag.warnAboveMinutes;
    const remaining = budget - planned;
    const flagged = remaining < 0;
    const band = document.getElementById("band");
    band.className = "band " + status;
    band.innerHTML = `<strong>${title}</strong>${line}
      <small class="time ${flagged ? "flag" : ""}" style="display:block;margin-top:6px">
        Planned ${fmtMin(planned)} of ${fmtMin(budget)} threshold. ${remaining >= 0 ? fmtMin(remaining) + " buffer remaining." : fmtMin(-remaining) + " over threshold."} Recorded ${fmtMin(loggedMinutes(day))}.</small>
      <small style="display:block">Showed up ${c.shown} of ${c.total} days so far.</small>`;
  }

  function renderSetup() {
    app.innerHTML = `<div class="setup"><h1>${esc(CONFIG.appName)}</h1>
      <p>Pick the day your 12 months begin. You can change it later in Settings.</p>
      <label>Start date<br><input id="start-date" type="date" value="${today()}"></label>
      <button class="primary" id="start-save">Start tracking</button>
      <button type="button" id="csv-import">Restore from CSV</button>
      <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
    </div>`;
  }

  // ---------- csv ----------
  function exportCsv() {
    if (!data.startDate) { toast("Set a start date first."); return; }
    const last = [today(), endDate(data.startDate)].sort()[0];
    const total = Math.max(0, diffDays(data.startDate, last) + 1);
    if (!total) { toast("Nothing to export yet."); return; }
    const days = [];
    for (let i = 0; i < total; i++) days.push(getDay(addDays(data.startDate, i)));
    const blob = new Blob([CSVTools.toCsv(days)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `lock-in-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${days.length} days.`);
  }

  function importCsvFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast("Could not read that file.");
    reader.onload = () => {
      const res = CSVTools.parseCsv(String(reader.result));
      if (!res.days.length) { toast(res.errors[0] || "No valid rows found."); return; }
      const startDate = data.startDate || res.days.map(d => d.date).sort()[0];
      const end = endDate(startDate);
      const inWindow = res.days.filter(d => d.date >= startDate && d.date <= end);
      const usable = inWindow.filter(d => !CSVTools.isBlank(d));
      const outside = res.days.length - inWindow.length;
      const replaced = usable.filter(d => data.days[d.date]).length;
      if (replaced && !confirm(`This replaces ${replaced} day${replaced === 1 ? "" : "s"} already saved in this browser. Continue?`)) return;
      usable.forEach(d => { data.days[d.date] = d; });
      data.startDate = startDate;
      const saved = Store.save(data);
      const t = today(); current = t < startDate ? startDate : (t > end ? end : t);
      render();
      toast(saved
        ? `Imported ${usable.length} day${usable.length === 1 ? "" : "s"}${outside ? `, ${outside} outside your 12 months skipped` : ""}${res.errors.length ? `. Note: ${res.errors[0]}` : ""}.`
        : "Imported, but browser storage would not save it.");
    };
    reader.readAsText(file);
  }

  // ---------- events ----------
  function mutate(fn) { const day = getDay(current); fn(day); saveDay(day); updateSummary(day); return day; }
  const num = v => v === "" ? null : Number(v);

  app.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.weekly) {
      if (!data.weeks) data.weeks = {};
      const key = weekStart(current);
      if (!data.weeks[key]) data.weeks[key] = {};
      data.weeks[key][t.dataset.weekly] = t.checked;
      if (!Store.save(data)) toast("Could not save. Browser storage may be full or blocked.");
    }
    else if (t.dataset.h) mutate(d => { d.habits[t.dataset.h] = t.type === "checkbox" ? t.checked : num(t.value); });
    else if (t.dataset.m) mutate(d => { d.measures[t.dataset.m] = ["weight", "energy", "sleepHours"].includes(t.dataset.m) ? num(t.value) : t.value; });
    else if (t.dataset.r) mutate(d => { d.reflection[t.dataset.r] = t.value; });
    else if (t.id === "heavy") mutate(d => { d.state = t.checked ? "heavy" : null; });
  });

  app.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.nav) {
      const next = t.dataset.nav === "today" ? today() : addDays(current, Number(t.dataset.nav));
      if (next < data.startDate || next > endDate(data.startDate)) { toast("That day is outside your 12 months."); return; }
      current = next; render();
    } else if (t.dataset.fill) {
      const h = habitById(t.dataset.fill);
      mutate(d => { d.habits[h.id] = h.target; });
      app.querySelector(`input[data-h="${h.id}"]`).value = h.target;
    } else if (t.id === "ex-add") {
      const min = num(document.getElementById("ex-min").value);
      if (!min || min < 1) { toast("Enter the minutes first."); return; }
      const day = mutate(d => d.exercise.push({ type: document.getElementById("ex-type").value, minutes: min, startTime: document.getElementById("ex-start").value }));
      document.getElementById("ex-min").value = ""; renderExercise(day);
    } else if (t.dataset.exDel) {
      const day = mutate(d => d.exercise.splice(Number(t.dataset.exDel), 1)); renderExercise(day);
    } else if (t.id === "csv-export") {
      exportCsv();
    } else if (t.id === "csv-import") {
      document.getElementById("csv-file").click();
    } else if (t.id === "start-save") {
      const v = document.getElementById("start-date").value;
      if (!v) { toast("Choose a start date."); return; }
      data.startDate = v; Store.save(data);
      current = [today(), endDate(v)].sort()[0] < v ? v : today(); render();
    }
  });

  app.addEventListener("change", e => {
    if (e.target.id === "csv-file") { importCsvFile(e.target.files[0]); e.target.value = ""; }
  });

  // ---------- week and block views (step 4) ----------
  const viewCtx = {
    app,
    get data() { return data; },
    today, getDay, toast,
    save() { if (!Store.save(data)) toast("Could not save. Browser storage may be full or blocked."); },
    render,
    setView(v) { view = v; render(); },
    goDay(date) { current = date; view = "day"; render(); window.scrollTo(0, 0); }
  };
  Views.init(viewCtx);

  render();
})();