"use strict";

/*
  Lock-In Tracker - daily affirmations (step 5)

  One affirmation per calendar day. The same one shows all day, including after a
  refresh. The order is shuffled, and nothing repeats until the whole list has been
  used. Edit, add or delete lines freely; the rest adapts.

  Affirmations.line(date?)  -> HTML for the subheading (date defaults to today)
  Affirmations.pick(date)   -> the text for that date
*/

const Affirmations = (function () {
  const LIST = [
    "Showing up small still counts.",
    "A heavy day held is a day won.",
    "I can be consistent without being perfect.",
    "My commitment to myself is real because I keep returning to it.",
    "Rest is part of the plan, not a break from it.",
    "I do the next small thing.",
    "My attention is mine to give. Today I give it to my own life.",
    "Progress is allowed to look quieter today.",
    "I am becoming someone I can rely on.",
    "Slow days still move me forward.",
    "I treat my body with patience and respect.",
    "What I practise daily becomes who I am.",
    "I do not need to earn rest.",
    "I choose my focus and let the rest wait.",
    "My goals are mine, and I am allowed to take them seriously.",
    "Today I notice one true thing I like about myself.",
    "Consistency is a quiet kind of courage.",
    "I keep promises to myself, gently and firmly.",
    "I can start again at any moment, without apology.",
    "My pace is a valid pace.",
    "One honest effort is enough for today.",
    "I am building a life that feels like mine.",
    "My energy goes to what is in my immediate life.",
    "I grow in the open, mistakes and all.",
    "I deserve the care I give so easily to others.",
    "Today's version of effort is enough.",
    "My work is visible, and it keeps getting better.",
    "I prepare, I pitch, I follow through.",
    "I learn something new and it stays with me.",
    "Small deposits, every day, add up.",
    "I am allowed to take up space.",
    "My body does its best for me, and I support it back.",
    "I choose consistency over intensity.",
    "Calm is a skill, and I am practising it.",
    "I protect my time like it matters, because it does.",
    "I do not have to feel motivated to begin.",
    "I speak to myself the way I would to someone I love.",
    "My future self is already grateful for today.",
    "I am more than my streak.",
    "Missing a day does not undo the days I showed up.",
    "I trust the process and I trust myself.",
    "I focus on my life, here and now.",
    "I give my energy to what grows me.",
    "I am disciplined and I am gentle. Both are true.",
    "I celebrate small wins, out loud.",
    "I choose what deserves my attention.",
    "Hard days are part of a long, strong story.",
    "I am doing this for me."
  ];

  // Small seeded generator so a given cycle always shuffles the same way.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(cycle) {
    const idx = LIST.map((_, i) => i), r = rng(cycle * 7919 + 13);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx;
  }

  function todayISO() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function dayNumber(date) { const [y, m, d] = date.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); }

  // The order for one cycle. If a cycle would open with the line that closed the
  // previous one, the first two swap, so the same line never shows two days running.
  function orderFor(cycle) {
    const order = shuffled(cycle);
    if (cycle > 0 && order[0] === shuffled(cycle - 1)[LIST.length - 1]) [order[0], order[1]] = [order[1], order[0]];
    return order;
  }

  function pick(date) {
    const n = dayNumber(date || todayISO()), len = LIST.length;
    const cycle = Math.floor(n / len), pos = n - cycle * len;
    return LIST[orderFor(cycle)[pos]];
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function line(date) { return `<p class="affirmation">${esc(pick(date))}</p>`; }

  return { pick, line, size: LIST.length };
})();

if (typeof module !== "undefined") module.exports = Affirmations;
