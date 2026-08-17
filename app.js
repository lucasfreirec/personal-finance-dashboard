"use strict";

/* ---------- Storage ---------- */
const KEY = "finance.v1";
const DEFAULT = { currency: "EUR", accent: "#4f8cff", accounts: [], transactions: [], upcoming: [], recurring: [], budgets: [], seededDefaults: false };

// Added once, on first run (or once for existing users), then never re-added.
const DEFAULT_ACCOUNTS = [
  { name: "BB Americas", color: "#f4d019", text: "#2b2300", badge: "BB", logo: "assets/bb.png" },
  { name: "Societe Generale", color: "#e60028", text: "#ffffff", badge: "SG", logo: "assets/sg.png" },
  { name: "Wise", color: "#9fe870", text: "#163300", badge: "W", logo: "assets/wise.webp" },
  { name: "Revolut", color: "#191c1f", text: "#ffffff", badge: "R", logo: "assets/revolut.png" },
];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return Object.assign(structuredClone(DEFAULT), JSON.parse(raw));
  } catch { return structuredClone(DEFAULT); }
}
let data = load();
function save() { localStorage.setItem(KEY, JSON.stringify(data)); }

function seedDefaultAccounts() {
  if (data.seededDefaults) return;
  DEFAULT_ACCOUNTS.forEach((d) =>
    data.accounts.push({ id: uid(), name: d.name, opening: 0, color: d.color, text: d.text, badge: d.badge, logo: d.logo }));
  data.seededDefaults = true;
  save();
}

// Give known bank accounts their logo/colors (covers accounts seeded before logos existed).
function applyBankBranding() {
  let changed = false;
  data.accounts.forEach((a) => {
    const b = DEFAULT_ACCOUNTS.find((d) => d.name.toLowerCase() === (a.name || "").toLowerCase());
    if (b && a.logo !== b.logo) {
      a.logo = b.logo;
      a.color = a.color || b.color;
      a.text = a.text || b.text;
      a.badge = a.badge || b.badge;
      changed = true;
    }
  });
  if (changed) save();
}

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function fmt(n) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(n || 0);
  } catch { return (n || 0).toFixed(2); }
}
function ym(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function isThisMonth(dateStr) { return (dateStr || "").slice(0, 7) === ym(); }
function nextMonth(monthStr) {
  let [y, m] = monthStr.split("-").map(Number);
  m += 1; if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2,"0")}`;
}
function prevMonth(monthStr) {
  let [y, m] = monthStr.split("-").map(Number);
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2,"0")}`;
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m is 1-based
function monthLabel(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/* Month being viewed in the dashboard, chart, budgets and history. */
let viewMonth = ym();
let showAllTx = false;
let filterCategory = "";
let readOnly = false;
function inViewMonth(dateStr) { return (dateStr || "").slice(0, 7) === viewMonth; }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function prettyDate(s) {
  if (!s) return "";
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
}

/* ---------- Accent color ---------- */
const ACCENTS = ["#4f8cff", "#36c98d", "#8b5cf6", "#ec4899", "#f5933b", "#ef4444", "#14b8a6"];
function hexToRgb(hex) {
  const m = String(hex).replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(v, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function applyAccent(color) {
  const c = color || "#4f8cff";
  const { r, g, b } = hexToRgb(c);
  document.documentElement.style.setProperty("--accent", c);
  document.documentElement.style.setProperty("--accent-soft", `rgba(${r},${g},${b},.16)`);
}
function renderSwatches() {
  const wrap = $("#swatches");
  if (!wrap) return;
  const cur = (data.accent || "").toLowerCase();
  wrap.innerHTML = ACCENTS.map((c) =>
    `<button class="swatch ${c.toLowerCase() === cur ? "active" : ""}" style="background:${c}" data-accent="${c}" title="${c}"></button>`).join("");
}
function setAccent(color) {
  data.accent = color;
  save();
  applyAccent(color);
  const picker = $("#accentPicker");
  if (picker) picker.value = color;
  renderSwatches();
}

/* ---------- Toast + undo ---------- */
let toastTimer;
function toast(msg, opts = {}) {
  const wrap = $("#toastWrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  const el = document.createElement("div");
  el.className = "toast";
  const span = document.createElement("span");
  span.textContent = msg;
  el.appendChild(span);
  if (opts.actionLabel) {
    const btn = document.createElement("button");
    btn.className = "tiny";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => { opts.onAction && opts.onAction(); dismissToast(); });
    el.appendChild(btn);
  }
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(dismissToast, opts.duration || 5000);
}
function dismissToast() {
  const el = $("#toastWrap") && $("#toastWrap").firstChild;
  if (!el) return;
  el.classList.remove("show");
  setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
}
// Run a change, then offer a one-step undo via toast.
function mutate(label, fn) {
  const snapshot = JSON.stringify(data);
  fn();
  save(); render();
  toast(label, { actionLabel: "Undo", onAction: () => { data = JSON.parse(snapshot); save(); render(); } });
}

/* ---------- Calculations ---------- */
function accountBalance(acc) {
  return data.transactions.reduce((sum, t) =>
    t.accountId === acc.id ? sum + (t.type === "income" ? t.amount : -t.amount) : sum,
    Number(acc.opening) || 0);
}
const totalBalance = () => data.accounts.reduce((s, a) => s + accountBalance(a), 0);
function monthTotal(type) {
  return data.transactions
    .filter((t) => t.type === type && inViewMonth(t.date))
    .reduce((s, t) => s + t.amount, 0);
}
const upcomingTotal = () => data.upcoming.reduce((s, u) => s + u.amount, 0);

function spendByCategory(monthStr = viewMonth) {
  const map = {};
  data.transactions.forEach((t) => {
    if (t.type !== "expense" || (t.date || "").slice(0, 7) !== monthStr) return;
    const c = (t.category && t.category.trim()) || "Uncategorized";
    map[c] = (map[c] || 0) + t.amount;
  });
  return map;
}
function categorySpentThisMonth(category) {
  const target = category.trim().toLowerCase();
  return data.transactions.reduce((s, t) =>
    (t.type === "expense" && inViewMonth(t.date) && (t.category || "").trim().toLowerCase() === target)
      ? s + t.amount : s, 0);
}

/* ---------- Recurring expenses ---------- */
// Posts a real expense transaction for every month due up to the current month.
function processRecurring() {
  if (!data.accounts.length) return;
  const current = ym();
  let changed = false;
  data.recurring.forEach((r) => {
    let cursor = nextMonth(r.lastPosted || prevMonth(current));
    while (cursor <= current) {
      const [y, m] = cursor.split("-").map(Number);
      const day = Math.min(Math.max(1, Number(r.day) || 1), daysInMonth(y, m));
      const accId = data.accounts.some((a) => a.id === r.accountId) ? r.accountId : data.accounts[0].id;
      data.transactions.push({
        id: uid(), type: "expense", amount: r.amount,
        description: r.description, category: r.category,
        date: `${cursor}-${String(day).padStart(2,"0")}`,
        accountId: accId, recurringId: r.id,
      });
      r.lastPosted = cursor;
      changed = true;
      cursor = nextMonth(cursor);
    }
  });
  if (changed) save();
}

/* ---------- Rendering ---------- */
function renderDashboard() {
  $("#cardTotal").textContent = fmt(totalBalance());
  $("#cardTotalSub").textContent =
    data.accounts.length ? `Across ${data.accounts.length} account${data.accounts.length>1?"s":""}` : "No accounts yet";
  $("#cardIncome").textContent = fmt(monthTotal("income"));
  $("#cardExpense").textContent = fmt(monthTotal("expense"));
  $("#cardUpcoming").textContent = fmt(upcomingTotal());
  const overdue = data.upcoming.filter((u) => (u.date || "") < todayStr());
  const cardUp = $("#cardUpcoming");
  cardUp.classList.toggle("expense", overdue.length > 0);
  cardUp.classList.toggle("warn", overdue.length === 0);
  $("#cardUpcomingSub").textContent = !data.upcoming.length
    ? "Nothing planned"
    : overdue.length
      ? `${overdue.length} overdue · ${data.upcoming.length} planned`
      : `${data.upcoming.length} planned item${data.upcoming.length>1?"s":""}`;
}

function accountOptions(selectedId) {
  if (!data.accounts.length) return `<option value="">— add an account first —</option>`;
  return data.accounts.map((a) =>
    `<option value="${a.id}" ${a.id===selectedId?"selected":""}>${esc(a.name)}</option>`).join("");
}

function accountInitials(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
function accountColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 50% 45%)`;
}
function accountBadge(acc) {
  const bg = acc.color || accountColor(acc.name);
  const fg = acc.text || "#ffffff";
  const txt = acc.badge || accountInitials(acc.name);
  const fallback = `<div class="badge" style="background:${esc(bg)};color:${esc(fg)}">${esc(txt)}</div>`;
  if (acc.logo) {
    // The image sits over the colored badge; if the file is missing it removes itself, revealing the badge.
    return `<div class="badge-wrap">${fallback}<img class="badge logo" src="${esc(acc.logo)}" alt="${esc(acc.name)}" onerror="this.remove()"></div>`;
  }
  return fallback;
}

function renderCategoryFilter() {
  const sel = $("#txCategoryFilter");
  if (!sel) return;
  const cats = new Set();
  data.transactions.forEach((t) => cats.add((t.category && t.category.trim()) || "Uncategorized"));
  const sorted = [...cats].sort((a, b) => a.localeCompare(b));
  // Keep the current selection even if no matching transaction exists this render.
  if (filterCategory && !cats.has(filterCategory)) sorted.push(filterCategory);
  sel.innerHTML = `<option value="">All categories</option>` +
    sorted.map((c) => `<option value="${esc(c)}" ${c === filterCategory ? "selected" : ""}>${esc(c)}</option>`).join("");
}

function renderTransactions() {
  $("#txAccount").innerHTML = accountOptions($("#txAccount").value);
  renderCategoryFilter();
  const list = $("#txList");
  const sorted = [...data.transactions].sort((a,b) => (b.date+b.id).localeCompare(a.date+a.id));
  let txs = showAllTx ? sorted : sorted.filter((t) => inViewMonth(t.date));
  if (filterCategory) {
    txs = txs.filter((t) => ((t.category && t.category.trim()) || "Uncategorized") === filterCategory);
  }
  $("#txScope").textContent = showAllTx ? "Show selected month" : "Show all months";
  $("#txHint").textContent = txs.length ? `${txs.length} ${txs.length === 1 ? "entry" : "entries"}` : "";
  if (!txs.length) {
    const scope = showAllTx ? "" : ` in ${monthLabel(viewMonth)}`;
    if (filterCategory) {
      list.innerHTML = emptyState("\u{1F9FE}", `No “${filterCategory}” transactions${scope}`, "Try another category or clear the filter.");
    } else {
      list.innerHTML = showAllTx
        ? emptyState("\u{1F9FE}", "No transactions yet", "Add your first expense or income above.")
        : emptyState("\u{1F9FE}", `Nothing in ${monthLabel(viewMonth)}`, "Switch months above, or click ‘Show all’.");
    }
    return;
  }
  list.innerHTML = txs.map((t) => {
    const acc = data.accounts.find((a) => a.id === t.accountId);
    const isTransfer = t.category === "Transfer";
    const sign = t.type === "income" ? "+" : "−";
    const dotColor = isTransfer ? "var(--accent)" : (t.type === "income" ? "var(--income)" : "var(--expense)");
    return `<div class="row">
      <div class="dot" style="background:${dotColor}"></div>
      <div class="main">
        <div class="title">${esc(t.description)}</div>
        <div class="meta">
          <span>${prettyDate(t.date)}</span>
          ${t.category ? `<span class="pill">${esc(t.category)}</span>` : ""}
          ${acc ? `<span class="pill">${esc(acc.name)}</span>` : ""}
        </div>
      </div>
      <div class="amount ${t.type}">${sign} ${fmt(t.amount)}</div>
      <div class="actions">
        <button class="tiny danger" data-action="del-tx" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join("");
}

function daysUntil(dateStr) {
  if (!dateStr) return 0;
  const [ty, tm, td] = todayStr().split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  return Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000);
}
function dueLabelFor(dateStr) {
  const diff = daysUntil(dateStr);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff === -1) return "Overdue · yesterday";
  if (diff < -1) return `Overdue · ${-diff} days ago`;
  if (diff <= 7) return `Due in ${diff} days`;
  return `Due ${prettyDate(dateStr)}`;
}

function renderUpcoming() {
  $("#upAccount").innerHTML = accountOptions($("#upAccount").value);
  const list = $("#upList");
  const items = [...data.upcoming].sort((a,b) => (a.date||"").localeCompare(b.date||""));
  if (!items.length) {
    list.innerHTML = emptyState("📅", "No future expenses", "Plan upcoming bills so nothing surprises you.");
    return;
  }
  list.innerHTML = items.map((u) => {
    const diff = daysUntil(u.date);
    const cls = diff < 0 ? "due-over" : diff <= 3 ? "due-soon" : "";
    const dotColor = diff < 0 ? "var(--expense)" : "var(--warn)";
    const acc = data.accounts.find((a) => a.id === u.accountId);
    return `<div class="row">
      <div class="dot" style="background:${dotColor}"></div>
      <div class="main">
        <div class="title">${esc(u.description)}</div>
        <div class="meta">
          <span class="${cls}">${dueLabelFor(u.date)}</span>
          ${u.category ? `<span class="pill">${esc(u.category)}</span>` : ""}
          ${acc ? `<span class="pill">${esc(acc.name)}</span>` : ""}
        </div>
      </div>
      <div class="amount expense">${fmt(u.amount)}</div>
      <div class="actions">
        <button class="tiny primary" data-action="pay" data-id="${u.id}" title="Log as paid today">Paid</button>
        <button class="tiny danger" data-action="del-up" data-id="${u.id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join("");
}

let editingAccount = null;
function renderAccounts() {
  $("#tfFrom").innerHTML = accountOptions($("#tfFrom").value);
  $("#tfTo").innerHTML = accountOptions($("#tfTo").value);
  const list = $("#accList");
  if (!data.accounts.length) {
    list.innerHTML = emptyState("🏦", "No accounts yet", "Add an account to track where your money is.");
    return;
  }
  list.innerHTML = data.accounts.map((a) => {
    if (a.id === editingAccount) {
      return `<div class="row">
        <div class="main" style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="editName-${a.id}" type="text" value="${esc(a.name)}" placeholder="Account name" style="flex:2;min-width:140px" />
          <input id="editOpening-${a.id}" type="number" step="0.01" value="${accountBalance(a)}" placeholder="Current balance" style="flex:1;min-width:120px" />
        </div>
        <div class="actions">
          <button class="tiny primary" data-action="save-acc" data-id="${a.id}">Save</button>
          <button class="tiny ghost" data-action="cancel-acc" data-id="${a.id}">Cancel</button>
        </div>
      </div>`;
    }
    const bal = accountBalance(a);
    return `<div class="row">
      ${accountBadge(a)}
      <div class="main">
        <div class="title">${esc(a.name)}</div>
        <div class="meta"><span>Last balance ${fmt(Number(a.opening)||0)}</span></div>
      </div>
      <div class="amount ${bal<0?"expense":""}">${fmt(bal)}</div>
      <div class="actions">
        <button class="tiny" data-action="edit-acc" data-id="${a.id}" title="Edit account">Edit</button>
        <button class="tiny danger" data-action="del-acc" data-id="${a.id}" title="Delete account">✕</button>
      </div>
    </div>`;
  }).join("");
}

function emptyState(icon, title, sub) {
  return `<div class="empty"><div class="big">${icon}</div><div>${esc(title)}</div><div class="hint">${esc(sub)}</div></div>`;
}

function renderChart() {
  const chart = $("#chart");
  $("#chartHeading").textContent = `Spending by category · ${monthLabel(viewMonth)}`;
  const entries = Object.entries(spendByCategory(viewMonth)).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  $("#chartTotal").textContent = total ? "Total " + fmt(total) : "";
  if (!entries.length) {
    chart.innerHTML = `<div class="hint" style="padding:6px 2px">No spending recorded for ${esc(monthLabel(viewMonth))} yet.</div>`;
    return;
  }
  const max = entries[0][1] || 1;
  chart.innerHTML = entries.map(([name, val]) => {
    const pct = Math.round((val / max) * 100);
    return `<div class="bar-row">
      <div class="name" title="${esc(name)}">${esc(name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
      <div class="val">${fmt(val)}</div>
    </div>`;
  }).join("");
}

function renderRecurring() {
  $("#recAccount").innerHTML = accountOptions($("#recAccount").value);
  const list = $("#recList");
  if (!data.recurring.length) {
    list.innerHTML = emptyState("\u{1F501}", "No recurring expenses", "Add bills like rent or subscriptions to auto-log them each month.");
    return;
  }
  list.innerHTML = data.recurring.map((r) => {
    const acc = data.accounts.find((a) => a.id === r.accountId);
    const day = Math.min(Math.max(1, Number(r.day) || 1), 31);
    return `<div class="row">
      <div class="dot" style="background:var(--accent)"></div>
      <div class="main">
        <div class="title">${esc(r.description)}</div>
        <div class="meta">
          <span>Every month on day ${day}</span>
          ${r.category ? `<span class="pill">${esc(r.category)}</span>` : ""}
          ${acc ? `<span class="pill">${esc(acc.name)}</span>` : ""}
        </div>
      </div>
      <div class="amount expense">${fmt(r.amount)}</div>
      <div class="actions">
        <button class="tiny danger" data-action="del-rec" data-id="${r.id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join("");
}

function renderBudgets() {
  const list = $("#budList");
  $("#budHint").textContent = `Tracking ${monthLabel(viewMonth)}`;
  if (!data.budgets.length) {
    list.innerHTML = emptyState("\u{1F3AF}", "No budgets set", "Set a monthly limit per category to keep spending in check.");
    return;
  }
  list.innerHTML = data.budgets.map((b) => {
    const spent = categorySpentThisMonth(b.category);
    const limit = Number(b.limit) || 0;
    const ratio = limit ? spent / limit : 0;
    const pct = Math.min(100, Math.round(ratio * 100));
    const over = spent > limit;
    const color = over ? "var(--expense)" : ratio >= 0.8 ? "var(--warn)" : "var(--income)";
    const remaining = limit - spent;
    return `<div class="row" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:12px;width:100%">
        <div class="main">
          <div class="title">${esc(b.category)}</div>
          <div class="meta"><span style="color:${over ? "var(--expense)" : "var(--muted)"}">
            ${fmt(spent)} of ${fmt(limit)} · ${over ? "over by " + fmt(-remaining) : fmt(remaining) + " left"}
          </span></div>
        </div>
        <div class="amount" style="color:${color}">${Math.round(ratio * 100)}%</div>
        <div class="actions">
          <button class="tiny danger" data-action="del-bud" data-id="${b.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="progress"><div style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  }).join("");
}

function render() {
  updateMonthNav();
  renderDashboard();
  renderChart();
  renderTransactions();
  renderUpcoming();
  renderRecurring();
  renderBudgets();
  renderAccounts();
  renderFooter();
}

function updateMonthNav() {
  readOnly = viewMonth !== ym();
  document.body.classList.toggle("read-only", readOnly);
  $("#monthLabel").textContent = monthLabel(viewMonth);
  $("#nextMonth").disabled = viewMonth >= ym();
  $("#thisMonthBtn").style.visibility = readOnly ? "visible" : "hidden";
  if (readOnly) $("#roMonth").textContent = monthLabel(viewMonth);
}

function renderFooter() {
  const n = data.transactions.length;
  $("#footerNote").innerHTML =
    `Your data lives privately in this browser on this Mac (nothing is sent online). ` +
    `It is <b>not</b> a file in this folder yet. ` +
    `Click <b>Save to file</b> to keep a <code>finance-data.json</code> copy next to <code>index.html</code> ` +
    `(choose this folder when your browser asks), and <b>Load file</b> to restore it. ` +
    `Currently tracking ${n} transaction${n === 1 ? "" : "s"}.`;
}

/* ---------- Month navigator & history scope ---------- */
const accentTrigger = $("#accentTrigger");
const accentPop = $("#accentPop");
accentTrigger.addEventListener("click", (e) => { e.stopPropagation(); accentPop.hidden = !accentPop.hidden; });
document.addEventListener("click", (e) => {
  if (!accentPop.hidden && !accentPop.contains(e.target) && e.target !== accentTrigger) accentPop.hidden = true;
});
$("#swatches").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-accent]");
  if (b) { setAccent(b.dataset.accent); accentPop.hidden = true; }
});
$("#accentPicker").addEventListener("input", (e) => setAccent(e.target.value));
$("#prevMonth").addEventListener("click", () => { viewMonth = prevMonth(viewMonth); render(); });
$("#nextMonth").addEventListener("click", () => { if (viewMonth >= ym()) return; viewMonth = nextMonth(viewMonth); render(); });
$("#thisMonthBtn").addEventListener("click", () => { viewMonth = ym(); render(); });
$("#roBackBtn").addEventListener("click", () => { viewMonth = ym(); render(); });
$("#txScope").addEventListener("click", () => { showAllTx = !showAllTx; renderTransactions(); });
$("#txCategoryFilter").addEventListener("change", (e) => { filterCategory = e.target.value; renderTransactions(); });

/* ---------- Tabs ---------- */
document.querySelectorAll("nav.tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("#panel-" + btn.dataset.tab).classList.add("active");
  });
});

/* ---------- Forms ---------- */
$("#txDate").value = todayStr();
$("#upDate").value = todayStr();

$("#txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (readOnly) return;
  const amount = parseFloat($("#txAmount").value);
  if (!(amount > 0)) return;
  if (!data.accounts.length) {
    toast("Add an account first (Accounts tab) so we know where the money is.");
    return;
  }
  const newTx = {
    id: uid(),
    type: $("#txType").value,
    amount,
    description: $("#txDesc").value.trim(),
    category: $("#txCategory").value.trim(),
    date: $("#txDate").value || todayStr(),
    accountId: $("#txAccount").value,
  };
  data.transactions.push(newTx);
  save(); render();
  pushToSupabase(newTx);
  e.target.reset();
  $("#txDate").value = todayStr();
  $("#txAmount").focus();
});

$("#upForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (readOnly) return;
  const amount = parseFloat($("#upAmount").value);
  if (!(amount > 0)) return;
  data.upcoming.push({
    id: uid(),
    description: $("#upDesc").value.trim(),
    amount,
    category: $("#upCategory").value.trim(),
    date: $("#upDate").value || todayStr(),
    accountId: $("#upAccount").value,
  });
  save(); render();
  e.target.reset();
  $("#upDate").value = todayStr();
  $("#upDesc").focus();
});

$("#accForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (readOnly) return;
  data.accounts.push({
    id: uid(),
    name: $("#accName").value.trim(),
    opening: parseFloat($("#accOpening").value) || 0,
  });
  processRecurring();
  save(); render();
  e.target.reset();
  $("#accName").focus();
});

$("#recForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (readOnly) return;
  const amount = parseFloat($("#recAmount").value);
  if (!(amount > 0)) return;
  if (!data.accounts.length) {
    toast("Add an account first (Accounts tab) so recurring bills can be logged.");
    return;
  }
  data.recurring.push({
    id: uid(),
    description: $("#recDesc").value.trim(),
    amount,
    category: $("#recCategory").value.trim(),
    accountId: $("#recAccount").value,
    day: Math.min(31, Math.max(1, parseInt($("#recDay").value) || 1)),
    lastPosted: prevMonth(ym()),
  });
  processRecurring(); // post this month's charge right away
  save(); render();
  e.target.reset();
  $("#recDay").value = 1;
  $("#recDesc").focus();
});

$("#budForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (readOnly) return;
  const category = $("#budCategory").value.trim();
  const limit = parseFloat($("#budLimit").value);
  if (!category || !(limit >= 0)) return;
  const existing = data.budgets.find((b) => b.category.toLowerCase() === category.toLowerCase());
  if (existing) existing.limit = limit;
  else data.budgets.push({ id: uid(), category, limit });
  save(); render();
  e.target.reset();
  $("#budCategory").focus();
});

$("#transferForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (readOnly) return;
  const amount = parseFloat($("#tfAmount").value);
  if (!(amount > 0)) return;
  const fromId = $("#tfFrom").value;
  const toId = $("#tfTo").value;
  if (!fromId || !toId || fromId === toId) {
    toast("Pick two different accounts.");
    return;
  }
  const fromAcc = data.accounts.find((a) => a.id === fromId);
  const toAcc = data.accounts.find((a) => a.id === toId);
  const linkId = uid();
  mutate("Transfer recorded", () => {
    data.transactions.push({
      id: uid(), type: "expense", amount,
      description: `Transfer to ${toAcc.name}`,
      category: "Transfer", date: todayStr(),
      accountId: fromId, transferId: linkId,
    });
    data.transactions.push({
      id: uid(), type: "income", amount,
      description: `Transfer from ${fromAcc.name}`,
      category: "Transfer", date: todayStr(),
      accountId: toId, transferId: linkId,
    });
  });
  e.target.reset();
  $("#tfAmount").focus();
});

/* ---------- Row actions (event delegation) ---------- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (readOnly) return;
  const id = btn.dataset.id;
  switch (btn.dataset.action) {
    case "del-tx":
      mutate("Transaction deleted", () => { data.transactions = data.transactions.filter((t) => t.id !== id); });
      deleteFromSupabase(id);
      break;
    case "del-up":
      mutate("Future expense deleted", () => { data.upcoming = data.upcoming.filter((u) => u.id !== id); });
      break;
    case "del-rec":
      mutate("Recurring expense deleted", () => { data.recurring = data.recurring.filter((r) => r.id !== id); });
      break;
    case "del-bud":
      mutate("Budget deleted", () => { data.budgets = data.budgets.filter((b) => b.id !== id); });
      break;
    case "pay": {
      const item = data.upcoming.find((u) => u.id === id);
      if (!item) break;
      if (!data.accounts.length) { toast("Add an account first to log this payment."); break; }
      const accId = data.accounts.some((a) => a.id === item.accountId) ? item.accountId : data.accounts[0].id;
      mutate("Marked as paid", () => {
        data.transactions.push({
          id: uid(), type: "expense", amount: item.amount,
          description: item.description, category: item.category,
          date: todayStr(), accountId: accId,
        });
        data.upcoming = data.upcoming.filter((u) => u.id !== id);
      });
      break;
    }
    case "edit-acc":
      editingAccount = id;
      renderAccounts();
      break;
    case "cancel-acc":
      editingAccount = null;
      renderAccounts();
      break;
    case "save-acc": {
      const acc = data.accounts.find((a) => a.id === id);
      if (!acc) break;
      const name = document.getElementById("editName-" + id).value.trim();
      const newBalance = parseFloat(document.getElementById("editOpening-" + id).value) || 0;
      if (name) acc.name = name;
      // Keep logged transactions intact: derive the starting balance so that
      // starting + (income - expenses) equals the entered current balance.
      const delta = accountBalance(acc) - (Number(acc.opening) || 0);
      acc.opening = newBalance - delta;
      editingAccount = null;
      save(); render(); break;
    }
    case "del-acc": {
      const acc = data.accounts.find((a) => a.id === id);
      const count = data.transactions.filter((t) => t.accountId === id).length;
      const msg = count
        ? `Delete "${acc?.name}" and its ${count} transaction(s)? This cannot be undone.`
        : `Delete "${acc?.name}"?`;
      if (!confirm(msg)) break;
      mutate("Account deleted", () => {
        data.accounts = data.accounts.filter((a) => a.id !== id);
        data.transactions = data.transactions.filter((t) => t.accountId !== id);
      });
      break;
    }
  }
});

/* ---------- Export / Import ---------- */
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "finance-data.json"; a.click();
  URL.revokeObjectURL(url);
});
$("#importBtn").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (typeof parsed !== "object" || !parsed) throw new Error("bad");
      data = Object.assign(structuredClone(DEFAULT), parsed);
      data.accounts ||= []; data.transactions ||= []; data.upcoming ||= [];
      data.recurring ||= []; data.budgets ||= [];
      data.seededDefaults = true;
      processRecurring();
      save();
      applyAccent(data.accent);
      if ($("#accentPicker")) $("#accentPicker").value = data.accent || "#4f8cff";
      renderSwatches();
      render();
      toast("Backup imported successfully.");
    } catch { toast("That file could not be read as a valid backup."); }
    e.target.value = "";
  };
  reader.readAsText(file);
});

/* ---------- Go ---------- */
seedDefaultAccounts();
applyBankBranding();
applyAccent(data.accent);
if ($("#accentPicker")) $("#accentPicker").value = data.accent || "#4f8cff";
renderSwatches();
processRecurring();
render();

// Pull expenses added via iPhone Shortcut
function runSync() {
  sync(data).then((n) => { if (n > 0) { save(); render(); toast(`Synced ${n} change${n > 1 ? "s" : ""}`); } });
}
runSync();

// Re-sync when returning to the tab (Safari freezes pages in background)
document.addEventListener("visibilitychange", () => { if (!document.hidden) runSync(); });

// Auto-sync every 30s while the page is visible
setInterval(() => { if (!document.hidden) runSync(); }, 30000);
