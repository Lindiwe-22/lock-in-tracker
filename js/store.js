"use strict";

// Minimal persistence in browser storage. Shape: { startDate: "YYYY-MM-DD" | null, days: { [date]: day } }
// Step 3 adds CSV export and import on top of this, without changing the shape.
const Store = {
  key: "lockin.v1",
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key));
      if (raw && typeof raw === "object") return { startDate: raw.startDate || null, days: raw.days || {}, weeks: raw.weeks || {} };
    } catch (e) { /* fall through to empty */ }
    return { startDate: null, days: {}, weeks: {} };
  },
  save(data) {
    try { localStorage.setItem(this.key, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }
};