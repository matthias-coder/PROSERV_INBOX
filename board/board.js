/* Proserv Board. Reads opportunities from the artifact database and lets Contributors maintain assignments.
   Data model: sync/schema.md. Everything read from the database is untrusted and only ever set as text. */
(function () {
  "use strict";

  /* the PS process: 14 stages in three phases; an opportunity without a stage is at "1 Creation" */
  var PHASES = [
    { id: "sell", label: "Pre-sales" },
    { id: "deliver", label: "Delivery" },
    { id: "finance", label: "Finance" }
  ];
  var STAGES = [
    { id: "1", label: "Creation", phase: "sell" },
    { id: "2", label: "Qualification", phase: "sell" },
    { id: "3.1-3.2", label: "Request and Go/No-Go", phase: "sell" },
    { id: "3.3", label: "Quote cycle", phase: "sell" },
    { id: "3.4", label: "Lines, costs, margins", phase: "sell" },
    { id: "4", label: "Negotiation", phase: "sell" },
    { id: "5", label: "Waiting for PO", phase: "sell" },
    { id: "6", label: "Closed", phase: "sell" },
    { id: "7", label: "Handover", phase: "deliver" },
    { id: "8", label: "Set-up", phase: "deliver" },
    { id: "9", label: "Kick-off", phase: "deliver" },
    { id: "10", label: "Delivery", phase: "deliver" },
    { id: "11", label: "Closure", phase: "deliver" },
    { id: "12", label: "Customer billing", phase: "finance" },
    { id: "13", label: "Partner costs", phase: "finance" },
    { id: "14", label: "Project P&L", phase: "finance" }
  ];
  var STAGE_BY_ID = {};
  STAGES.forEach(function (s, i) { s.order = i; s.name = s.id + " " + s.label; STAGE_BY_ID[s.id] = s; });
  var OUTCOMES = [{ id: "no-bid", name: "No bid" }, { id: "lost", name: "Lost" }, { id: "cancelled", name: "Cancelled" }, { id: "done", name: "Completed" }];
  var OUTCOME_NAME = {};
  OUTCOMES.forEach(function (o) { OUTCOME_NAME[o.id] = o.name; });
  var BID_FROM = 3, WON_FROM = 7; /* position in STAGES: a bid exists from 3.3 Quote cycle, a win from 6 Closed */
  var OWNERS = [
    { key: "salesPm", role: "sales-pm", label: "Sales PM" },
    { key: "sa", role: "sa", label: "Solution Architect" },
    { key: "pm", role: "pm", label: "Project Manager" }
  ];
  var ICON_GLOBE = "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z";
  var ICON_CLOSE = "M6 6l12 12M18 6L6 18";
  var PREFS_KEY = "proserv-board-filters";

  var state = {
    db: null, user: null, userId: null, canWrite: null,
    opps: {}, assign: {}, corrections: {}, people: [], roles: [], regions: null, sync: null,
    loaded: { opps: false, assign: false }, failed: false,
    filters: { search: "", show: "open", service: "", sales: "", stage: "", person: "" },
    openId: null, panelDirty: false, opener: null, page: "board"
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- small helpers ---------- */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "on") Object.keys(value).forEach(function (ev) { node.addEventListener(ev, value[ev]); });
        else node.setAttribute(key, value === true ? "" : String(value));
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function icon(path, size) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size); svg.setAttribute("height", size); svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", path);
    svg.appendChild(p);
    return svg;
  }

  function str(value) { return typeof value === "string" ? value : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function uniq(values) { return values.filter(function (v, i) { return v && values.indexOf(v) === i; }); }

  function parseDay(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(text));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  var fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
  var fmtDayYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  var fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
  function day(text) {
    var d = parseDay(text);
    if (!d) return "";
    return d.getFullYear() === new Date().getFullYear() ? fmtDay.format(d) : fmtDayYear.format(d);
  }
  function stamp(text) {
    var d = new Date(str(text));
    return isNaN(d) ? "" : fmtDayYear.format(d) + ", " + fmtTime.format(d);
  }
  function isPast(text) {
    var d = parseDay(text);
    if (!d) return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return d < today;
  }
  function ago(text) {
    var d = new Date(str(text));
    if (isNaN(d)) return "";
    var min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + " min ago";
    if (min < 48 * 60) return Math.round(min / 60) + " h ago";
    return stamp(text);
  }
  var fmtMoneyShort = new Intl.NumberFormat("en", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
  var fmtMoneyFull = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  function money(n) { return n > 0 ? fmtMoneyShort.format(n) : "–"; }
  function moneyFull(n) { return n > 0 ? fmtMoneyFull.format(n) : ""; }
  function amount(value) { var n = Number(value); return isFinite(n) && n > 0 ? n : 0; }
  function pct(part, whole) { return whole ? Math.round((part / whole) * 100) + " %" : "–"; }
  function safeLink(url) { return /^https:\/\//.test(str(url)) ? url : null; }

  /* ---------- lookups ---------- */

  function person(id) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === id) return state.people[i];
    return null;
  }
  function personName(id) { var p = person(id); return p ? str(p.name) : ""; }
  function peopleWithRole(role) { return state.people.filter(function (p) { return p.role === role; }); }
  function country(code) {
    var all = state.regions ? list(state.regions.countries) : [];
    for (var i = 0; i < all.length; i++) if (all[i].code === code) return all[i];
    return { code: code, name: code };
  }
  function regions() { return state.regions ? list(state.regions.regions) : []; }
  function regionName(id) {
    var all = regions();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return str(all[i].name);
    return str(id);
  }
  function roleName(id) {
    for (var i = 0; i < state.roles.length; i++) if (state.roles[i].id === id) return str(state.roles[i].name);
    return str(id);
  }
  /* country tags carry the colour of their rate-card region (TITANIA), not of the PS region */
  var RATE_CLASS = { emea: "region-emea", apac: "region-apac", americas: "region-americas", latam: "region-latam" };

  /* one opportunity as the board shows it: the team's values where set, otherwise what follows from the countries */
  function view(opp) {
    var a = state.assign[opp.id] || {};
    var countries = list(opp.countries).map(country);
    var derivedService = uniq(countries.map(function (c) { return c.region; }));
    var derivedSales = uniq(list(opp.salesRegions));
    var stage = STAGE_BY_ID[a.stage] || STAGE_BY_ID["1"];
    var outcome = OUTCOME_NAME[a.outcome] ? a.outcome : "";
    var open = !outcome;
    var fastLane = a.fastLane === true;
    var need = { salesPm: open && stage.phase === "sell", sa: open && stage.phase === "sell" && !fastLane, pm: open && stage.phase === "deliver" };
    var ownTcv = amount(a.tcv), readTcv = amount(opp.tcv);
    var negative = outcome === "no-bid" || outcome === "lost" || outcome === "cancelled";
    var ownNext = a.nextAction && str(a.nextAction.text).trim() ? a.nextAction : null;
    var aiNext = opp.nextAction && str(opp.nextAction.text).trim() ? opp.nextAction : null;
    return {
      opp: opp, assign: a, countries: countries,
      stage: stage, outcome: outcome, open: open, need: need, fastLane: fastLane,
      tcv: ownTcv || readTcv, tcvSuggested: !ownTcv && readTcv > 0,
      isNoBid: outcome === "no-bid", isLost: outcome === "lost", isCancelled: outcome === "cancelled",
      isBid: outcome !== "no-bid" && (stage.order >= BID_FROM || outcome === "lost"),
      isWon: !negative && stage.order >= WON_FROM,
      salesPm: str(a.salesPm), sa: str(a.sa), pm: str(a.pm),
      needsOwner: (need.salesPm && !str(a.salesPm)) || (need.sa && !str(a.sa)) || (need.pm && !str(a.pm)),
      serviceRegions: list(a.serviceRegions).length ? list(a.serviceRegions) : derivedService,
      salesRegions: str(a.salesRegion) ? [a.salesRegion] : derivedSales,
      derivedService: derivedService, derivedSales: derivedSales,
      next: ownNext ? { text: str(ownNext.text), who: str(ownNext.who), due: str(ownNext.due), suggested: false }
        : aiNext ? { text: str(aiNext.text), who: "", due: str(aiNext.due), suggested: true } : null
    };
  }

  function matches(v) {
    var f = state.filters;
    if (f.show === "open" && !v.open) return false;
    if (f.show === "closed" && v.open) return false;
    if (f.service && v.serviceRegions.indexOf(f.service) < 0) return false;
    if (f.sales && v.salesRegions.indexOf(f.sales) < 0) return false;
    if (f.stage && v.stage.id !== f.stage) return false;
    if (f.person && v.salesPm !== f.person && v.sa !== f.person && v.pm !== f.person) return false;
    var q = f.search.trim().toLowerCase();
    if (q) {
      var hay = [str(v.opp.title), str(v.opp.customer), personName(v.salesPm), personName(v.sa), personName(v.pm)]
        .concat(list(v.opp.refs).map(function (r) { return str(r.value); }))
        .concat(v.countries.map(function (c) { return str(c.name); }))
        .concat(list(v.opp.stakeholders).map(function (s) { return str(s.name); }))
        .join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  /* ---------- lists ---------- */

  function countryTag(c) {
    var cls = RATE_CLASS[c.rateRegion];
    var region = c.region ? regionName(c.region) + (c.team && c.team !== regionName(c.region) ? " " + c.team : "") : "";
    return el("span", { class: "tag cond" + (cls ? " " + cls : ""), title: region ? c.name + " · " + region : c.name, text: str(c.name) });
  }

  function statusTag(v) {
    if (v.outcome) return el("span", { class: "status-tag st-" + v.outcome, title: "Closed at stage " + v.stage.name, text: OUTCOME_NAME[v.outcome] });
    return el("span", { class: "status-tag st-" + v.stage.phase + (v.stage.id === "1" ? " st-first" : ""), title: "Stage " + v.stage.id, text: v.stage.name });
  }

  function ownerCell(owner, v) {
    var id = v[owner.key];
    var value = id ? el("span", { class: "opp-v", text: personName(id) || "Unknown person" })
      : v.need[owner.key] ? el("span", { class: "opp-v" }, el("span", { class: "tag warn", text: "Missing" }))
        : owner.key === "sa" && v.fastLane && v.open ? el("span", { class: "opp-v none", text: "Not needed" })
          : el("span", { class: "opp-v none", text: "–" });
    return el("span", { class: "opp-cell" }, el("span", { class: "opp-k", text: owner.label }), value);
  }

  function row(v) {
    var opp = v.opp;
    var tags = el("span", { class: "req-tags" });
    if (v.countries.length) {
      var g = el("span", { class: "req-group req-countries" },
        el("span", { class: "req-ico", title: "Countries" }, icon(ICON_GLOBE, 16), el("span", { class: "sr-only", text: "Countries" })));
      v.countries.forEach(function (c) { g.appendChild(countryTag(c)); });
      tags.appendChild(g);
    }
    if (v.serviceRegions.length || v.salesRegions.length) {
      var s = el("span", { class: "req-group" });
      if (v.serviceRegions.length) s.appendChild(el("span", { class: "tag", title: "Service region", text: "Service · " + v.serviceRegions.map(regionName).join(", ") }));
      if (v.salesRegions.length) s.appendChild(el("span", { class: "tag cond", title: "Sales region", text: "Sales · " + v.salesRegions.map(regionName).join(", ") }));
      tags.appendChild(s);
    }
    if (list(opp.refs).length) {
      var r = el("span", { class: "req-group" });
      list(opp.refs).forEach(function (ref) { r.appendChild(el("span", { class: "tag cond mono", title: str(ref.type), text: str(ref.value) })); });
      tags.appendChild(r);
    } else if (v.open) {
      tags.appendChild(el("span", { class: "req-group" }, el("span", { class: "tag cond", text: "No reference yet" })));
    }
    var count = Number(opp.mailCount) || list(opp.mails).length;
    tags.appendChild(el("span", { class: "req-fact", text: count + (count === 1 ? " mail" : " mails") + (opp.lastMailAt ? " · last " + day(opp.lastMailAt) : "") }));
    if (opp.needsReview) tags.appendChild(el("span", { class: "tag warn", text: "Check grouping" }));

    var main = el("span", { class: "opp-main" },
      el("span", { class: "req-top" }, statusTag(v), v.fastLane ? el("span", { class: "tag cond lane", title: "Small deal: no Solution Architect needed", text: "Fast lane" }) : null,
        el("span", { class: "req-main" }, el("strong", { text: str(opp.title) || "Untitled" }), opp.customer ? " · " + str(opp.customer) : null)),
      tags);
    if (v.next && v.open) {
      var extra = [v.next.who ? personName(v.next.who) : "", v.next.due ? "by " + day(v.next.due) : "", v.next.suggested ? "suggested" : ""].filter(Boolean).join(" · ");
      main.appendChild(el("span", { class: "opp-next" }, el("strong", { text: "Next: " }), v.next.text + (extra ? " (" + extra + ")" : "")));
    }

    var deadline = el("span", { class: "opp-cell" }, el("span", { class: "opp-k", text: "Deadline" }),
      opp.deadline ? el("span", { class: "opp-v" + (v.open && isPast(opp.deadline) ? " overdue" : ""), title: str(opp.deadlineNote) || null,
        text: day(opp.deadline) + (v.open && isPast(opp.deadline) ? " · overdue" : "") })
        : el("span", { class: "opp-v none", text: "–" }));

    var tcv = el("span", { class: "opp-cell" }, el("span", { class: "opp-k", text: "TCV" }),
      v.tcv ? el("span", { class: "opp-v", title: moneyFull(v.tcv) + (v.tcvSuggested ? ", read from the mails, not confirmed" : ""), text: money(v.tcv) + (v.tcvSuggested ? " ?" : "") })
        : el("span", { class: "opp-v none", text: "–" }));

    var current = state.openId === opp.id;
    var btn = el("button", { type: "button", class: "opp-btn", id: "row-" + opp.id, "aria-expanded": current ? "true" : "false", "aria-controls": "panel",
      on: { click: function () { openPanel(opp.id, btn); } } },
      main, ownerCell(OWNERS[0], v), ownerCell(OWNERS[1], v), ownerCell(OWNERS[2], v), tcv, deadline, el("span", { class: "opp-go", "aria-hidden": "true", text: "›" }));
    return el("li", { class: "request opp" + (current ? " current" : "") }, btn);
  }

  function section(title, note, views) {
    var ul = el("ul", { class: "requests" });
    views.forEach(function (v) { ul.appendChild(row(v)); });
    return el("section", { class: "card board-section" },
      el("div", { class: "board-section-head" }, el("h2", { class: "section-title", text: title }), el("span", { class: "ov-count", text: String(views.length) }),
        note ? el("p", { class: "board-section-note", text: note }) : null),
      ul);
  }

  function byDeadlineThenRecent(a, b) {
    var da = str(a.opp.deadline) || "9999", dbb = str(b.opp.deadline) || "9999";
    if (da !== dbb) return da < dbb ? -1 : 1;
    return str(b.opp.lastMailAt).localeCompare(str(a.opp.lastMailAt));
  }
  function byRecent(a, b) { return str(b.opp.lastMailAt).localeCompare(str(a.opp.lastMailAt)); }
  function byStageThenRecent(a, b) { return a.stage.order !== b.stage.order ? a.stage.order - b.stage.order : byRecent(a, b); }

  function renderLists() {
    var lists = $("lists");
    var all = Object.keys(state.opps).map(function (id) { return view(state.opps[id]); });
    var shown = all.filter(matches);
    var focusId = document.activeElement && document.activeElement.id && document.activeElement.id.indexOf("row-") === 0 ? document.activeElement.id : null;
    lists.textContent = "";

    if (!state.loaded.opps) {
      lists.appendChild(el("section", { class: "card board-empty" }, el("p", { class: "empty muted", text: state.failed ? "The opportunities could not be loaded." : "Loading opportunities…" })));
    } else if (!all.length) {
      lists.appendChild(el("section", { class: "card board-empty" },
        el("h2", { class: "section-title", text: "No opportunities yet" }),
        el("p", { class: "muted", text: "Opportunities appear here after the first sync of the EVX Proserv mailbox. Each one bundles all mails about the same request." })));
    } else if (!shown.length) {
      lists.appendChild(el("section", { class: "card board-empty" },
        el("p", { class: "empty", text: "No opportunity matches these filters." }),
        el("button", { type: "button", class: "btn secondary", text: "Reset filters", on: { click: resetFilters } })));
    } else {
      var needs = shown.filter(function (v) { return v.needsOwner; }).sort(byDeadlineThenRecent);
      var done = shown.filter(function (v) { return !v.open; }).sort(byRecent);
      if (needs.length) lists.appendChild(section("Needs an owner", "Pre-sales without Sales PM or Solution Architect (fast lane: Sales PM only), delivery without Project Manager. Earliest deadline first.", needs));
      PHASES.forEach(function (ph) {
        var part = shown.filter(function (v) { return v.open && !v.needsOwner && v.stage.phase === ph.id; }).sort(byStageThenRecent);
        var first = STAGES.filter(function (s) { return s.phase === ph.id; });
        if (part.length) lists.appendChild(section(ph.label, "Stages " + first[0].id.split("-")[0] + " to " + first[first.length - 1].id + ", by stage.", part));
      });
      if (done.length) lists.appendChild(section("Closed", "No bid, lost, cancelled or completed. Latest mail first.", done));
    }
    if (focusId && $(focusId)) $(focusId).focus();
    renderStamp(all);
  }

  function renderStamp(all) {
    var note = $("demo-note"), text;
    var demo = state.sync && state.sync.mode === "demo";
    note.hidden = !demo;
    if (demo) note.textContent = str(state.sync.note) || "Demo data. The mailbox is not connected yet.";
    if (!state.loaded.opps) text = state.failed ? "Data not available" : "Loading…";
    else {
      var open = all.filter(function (v) { return v.open; });
      var needs = open.filter(function (v) { return v.needsOwner; }).length;
      var parts = [demo ? "Demo data, not synced" : state.sync && state.sync.lastRunAt ? "Last sync " + ago(state.sync.lastRunAt) : "Not synced yet",
        open.length + " open", needs + (needs === 1 ? " needs an owner" : " need an owner")];
      if (state.sync && state.sync.lastRunStatus && state.sync.lastRunStatus !== "ok") parts.unshift("Last sync failed");
      text = parts.join(" · ");
    }
    if ($("stamp").textContent !== text) $("stamp").textContent = text;
  }

  /* ---------- filters ---------- */

  function fillSelect(select, firstLabel, options, value) {
    select.textContent = "";
    select.appendChild(el("option", { value: "", text: firstLabel }));
    options.forEach(function (o) { select.appendChild(el("option", { value: o.id, text: str(o.name) })); });
    select.value = value;
    if (select.value !== value) select.value = "";
  }

  function fillGrouped(select, firstLabel, groups, value) {
    select.textContent = "";
    select.appendChild(el("option", { value: "", text: firstLabel }));
    groups.forEach(function (g) {
      if (!g.options.length) return;
      var og = el("optgroup", { label: g.label });
      g.options.forEach(function (o) { og.appendChild(el("option", { value: o.id, text: str(o.name) })); });
      select.appendChild(og);
    });
    select.value = value;
    if (select.value !== value) select.value = "";
  }
  function stageGroups() {
    return PHASES.map(function (ph) { return { label: ph.label, options: STAGES.filter(function (s) { return s.phase === ph.id; }) }; });
  }
  function ownerGroups() {
    return OWNERS.map(function (o) { return { label: o.label, options: peopleWithRole(o.role) }; });
  }

  function renderFilters() {
    var f = state.filters;
    fillSelect($("f-service"), "All", regions(), f.service);
    fillSelect($("f-sales"), "All", regions(), f.sales);
    fillGrouped($("f-stage"), "All", stageGroups(), f.stage);
    fillGrouped($("f-person"), "All", ownerGroups(), f.person);
    $("f-search").value = f.search;
    Array.prototype.forEach.call($("f-show").querySelectorAll(".seg-btn"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-value") === f.show ? "true" : "false");
    });
  }

  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.filters)); } catch (e) { /* storage is optional */ } }
  function loadPrefs() {
    try {
      var saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (saved && typeof saved === "object") Object.keys(state.filters).forEach(function (k) { if (typeof saved[k] === "string") state.filters[k] = saved[k]; });
      if (["open", "closed", "all"].indexOf(state.filters.show) < 0) state.filters.show = "open";
    } catch (e) { /* storage is optional */ }
  }
  function resetFilters() {
    state.filters = { search: "", show: "open", service: "", sales: "", stage: "", person: "" };
    savePrefs(); renderFilters(); renderLists();
    $("f-search").focus();
  }

  function wireFilters() {
    var timer = null;
    $("f-search").addEventListener("input", function (e) {
      state.filters.search = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(function () { savePrefs(); renderLists(); }, 150);
    });
    [["f-service", "service"], ["f-sales", "sales"], ["f-stage", "stage"], ["f-person", "person"]].forEach(function (pair) {
      $(pair[0]).addEventListener("change", function (e) { state.filters[pair[1]] = e.target.value; savePrefs(); renderLists(); });
    });
    $("f-show").addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn");
      if (!b) return;
      state.filters.show = b.getAttribute("data-value");
      savePrefs(); renderFilters(); renderLists();
    });
    $("f-toggle").addEventListener("click", function () {
      var open = $("filters").classList.toggle("open");
      $("f-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---------- side panel ---------- */

  function field(id, label, control, hint) {
    control.id = id;
    var box = el("div", { class: "field" }, el("div", { class: "label-row" }, el("label", { class: "label", for: id, text: label })), control);
    if (hint) { var h = el("p", { class: "hint", id: id + "-hint", text: hint }); control.setAttribute("aria-describedby", h.id); box.appendChild(h); }
    return box;
  }
  function select(options, value, firstLabel) {
    var s = el("select", { class: "input" });
    s.appendChild(el("option", { value: "", text: firstLabel }));
    options.forEach(function (o) { s.appendChild(el("option", { value: o.id, text: str(o.name || o.label) })); });
    s.value = value; if (s.value !== value) s.value = "";
    return s;
  }
  function part(title) {
    var p = el("section", { class: "panel-part" }, el("h3", { class: "panel-h", text: title }));
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]);
    return p;
  }

  function openPanel(id, opener) {
    if (state.panelDirty && state.openId && state.openId !== id) {
      var msg = document.querySelector("#panel .panel-msg.save");
      if (msg) { msg.className = "panel-msg save err"; msg.textContent = "Save or discard your changes first."; }
      var saveBtn = $("p-save"); if (saveBtn) saveBtn.focus();
      return;
    }
    state.openId = id; state.opener = opener || null; state.panelDirty = false;
    renderPanel(); renderLists();
    var title = $("panel-title"); if (title) title.focus();
  }
  function closePanel() {
    if (state.panelDirty) {
      var m = document.querySelector("#panel .panel-msg.save");
      if (m) { m.className = "panel-msg save err"; m.textContent = "Save or discard your changes first."; }
      var s = $("p-save"); if (s) s.focus();
      return;
    }
    var back = state.openId ? "row-" + state.openId : null;
    state.openId = null; state.panelDirty = false;
    renderPanel(); renderLists();
    if (back && $(back)) $(back).focus(); else $("f-search").focus();
  }

  function renderPanel() {
    var panel = $("panel"), opp = state.openId ? state.opps[state.openId] : null;
    $("layout").classList.toggle("with-aside", !!opp);
    panel.hidden = !opp;
    panel.textContent = "";
    if (!opp) return;
    var v = view(opp), editable = state.db && state.canWrite !== false;

    panel.appendChild(el("div", { class: "panel-head" },
      el("div", { class: "panel-head-text" },
        el("h2", { class: "panel-title", id: "panel-title", tabindex: "-1", text: str(opp.title) || "Untitled" }),
        opp.customer ? el("p", { class: "panel-sub", text: str(opp.customer) }) : null),
      el("button", { type: "button", class: "icon-btn", id: "p-close", "aria-label": "Close details", on: { click: closePanel } }, icon(ICON_CLOSE, 22))));

    var tags = el("div", { class: "panel-tags" }, statusTag(v));
    v.countries.forEach(function (c) { tags.appendChild(countryTag(c)); });
    list(opp.refs).forEach(function (ref) { tags.appendChild(el("span", { class: "tag cond mono", title: str(ref.type), text: str(ref.type) + " " + str(ref.value) })); });
    panel.appendChild(tags);
    if (opp.summary) panel.appendChild(el("p", { class: "panel-text", text: str(opp.summary) }));
    if (opp.needsReview) panel.appendChild(el("p", { class: "notice", text: "Check grouping: " + (str(opp.reviewNote) || "the sync was not sure these mails belong together.") }));

    panel.appendChild(editable ? assignForm(v) : assignRead(v));

    if (list(opp.stakeholders).length) {
      var people = el("ul", { class: "panel-list people" });
      list(opp.stakeholders).forEach(function (s) {
        people.appendChild(el("li", null, el("span", { class: "who", text: str(s.name) }),
          el("span", { class: "sub", text: [str(s.company), str(s.role)].filter(Boolean).join(" · ") })));
      });
      panel.appendChild(part("Stakeholders", people));
    }
    if (list(opp.timeline).length) {
      var tl = el("ul", { class: "panel-list" });
      list(opp.timeline).forEach(function (t) { tl.appendChild(el("li", null, el("span", { class: "panel-date", text: day(t.date) }), el("span", { text: str(t.text) }))); });
      panel.appendChild(part("Timeline", tl));
    }
    if (list(opp.mails).length) {
      var mails = el("ul", { class: "panel-list" });
      list(opp.mails).forEach(function (m) {
        var link = safeLink(m.link);
        var subject = link ? el("a", { href: link, target: "_blank", rel: "noopener noreferrer", text: str(m.subject) }) : el("span", { text: str(m.subject) });
        mails.appendChild(el("li", null, el("span", { class: "panel-date", text: day(m.date) }),
          el("span", null, el("span", { class: "who", text: str(m.from) }), el("br"), el("span", { class: "sub" }, subject))));
      });
      var total = Number(opp.mailCount) || list(opp.mails).length;
      panel.appendChild(part("Mails · " + total, mails));
    }
    if (editable) panel.appendChild(groupingForm(v));
  }

  function assignRead(v) {
    var dl = el("dl", { class: "panel-dl" });
    var add = function (k, val) { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", { text: val || "–" })); };
    add("Stage", v.stage.name + (v.fastLane ? " · Fast lane" : ""));
    if (v.outcome) add("Outcome", OUTCOME_NAME[v.outcome] + (str(v.assign.closedAt) ? " on " + day(v.assign.closedAt) : "") + (str(v.assign.closeReason) ? ": " + str(v.assign.closeReason) : ""));
    add("TCV", v.tcv ? moneyFull(v.tcv) + (v.tcvSuggested ? " (read from the mails, not confirmed)" : "") : "");
    OWNERS.forEach(function (o) { add(o.label, personName(v[o.key])); });
    add("Sales region", v.salesRegions.map(regionName).join(", "));
    add("Service region", v.serviceRegions.map(regionName).join(", "));
    if (v.next) add("Next action", v.next.text + (v.next.due ? " (by " + day(v.next.due) + ")" : ""));
    if (str(v.assign.note)) add("Note", str(v.assign.note));
    return part("Assignment", dl);
  }

  function assignForm(v) {
    var opp = v.opp, a = v.assign;
    var dirty = function () { state.panelDirty = true; msg.className = "panel-msg save"; msg.textContent = "Not saved yet."; };
    var autoSales = v.derivedSales.map(regionName).join(", ");
    var autoService = v.derivedService.map(regionName).join(", ");

    var fStage = el("select", { class: "input" });
    fillGrouped(fStage, "", stageGroups(), v.stage.id); fStage.remove(0); fStage.value = v.stage.id;
    var fOutcome = select(OUTCOMES, v.outcome, "Open");
    var fReason = el("input", { class: "input", type: "text", maxlength: "200", value: str(a.closeReason), placeholder: "For example: price, no partner coverage" });
    var fTcv = el("input", { class: "input num", type: "number", min: "0", step: "1", inputmode: "numeric", value: amount(a.tcv) ? String(amount(a.tcv)) : "",
      placeholder: v.tcvSuggested ? String(v.tcv) : "" });
    var lane = v.fastLane;
    var segLane = el("div", { class: "seg", role: "group", "aria-labelledby": "p-lane-label" });
    [[false, "Standard", "Solution Architect needed"], [true, "Fast lane", "Small deal: no Solution Architect needed"]].forEach(function (opt) {
      var b = el("button", { type: "button", class: "seg-btn", id: "p-lane-" + (opt[0] ? "fast" : "standard"), title: opt[2], "aria-pressed": lane === opt[0] ? "true" : "false", text: opt[1] });
      b.addEventListener("click", function () {
        lane = opt[0];
        Array.prototype.forEach.call(segLane.children, function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
        dirty();
      });
      segLane.appendChild(b);
    });
    var syncReason = function () { fReason.disabled = !fOutcome.value; };
    fOutcome.addEventListener("change", syncReason); syncReason();
    var fSalesPm = select(peopleWithRole("sales-pm"), v.salesPm, "Not assigned");
    var fSa = select(peopleWithRole("sa"), v.sa, "Not assigned");
    var fPm = select(peopleWithRole("pm"), v.pm, "Not assigned");
    var fSales = select(regions(), str(a.salesRegion), autoSales ? "From the mails (" + autoSales + ")" : "Not set");
    var chosenService = list(a.serviceRegions).slice();
    var segService = el("div", { class: "seg multi", role: "group", "aria-labelledby": "p-service-label" });
    regions().forEach(function (r) {
      var b = el("button", { type: "button", class: "seg-btn", id: "p-service-" + r.id, "aria-pressed": chosenService.indexOf(r.id) >= 0 ? "true" : "false", text: str(r.name) });
      b.addEventListener("click", function () {
        var i = chosenService.indexOf(r.id);
        if (i >= 0) chosenService.splice(i, 1); else chosenService.push(r.id);
        b.setAttribute("aria-pressed", i >= 0 ? "false" : "true");
        dirty();
      });
      segService.appendChild(b);
    });
    var ownNext = a.nextAction || {};
    var fNext = el("input", { class: "input", type: "text", maxlength: "200", value: str(ownNext.text), placeholder: v.next && v.next.suggested ? v.next.text : "" });
    var fWho = el("select", { class: "input" });
    fillGrouped(fWho, "Nobody yet", ownerGroups(), str(ownNext.who));
    var fDue = el("input", { class: "input", type: "date", value: str(ownNext.due) });
    var fNote = el("textarea", { class: "input", rows: "2", maxlength: "1000" }); fNote.value = str(a.note);
    var msg = el("p", { class: "panel-msg save", role: "status" });
    if (a.updatedAt) msg.textContent = "Last changed " + stamp(a.updatedAt) + ".";
    var save = el("button", { type: "button", class: "btn secondary", id: "p-save", text: "Save changes" });
    var discard = el("button", { type: "button", class: "btn cancel", id: "p-discard", text: "Discard" });
    [fStage, fOutcome, fSalesPm, fSa, fPm, fSales, fWho, fDue].forEach(function (c) { c.addEventListener("change", dirty); });
    [fNext, fNote, fReason, fTcv].forEach(function (c) { c.addEventListener("input", dirty); });
    discard.addEventListener("click", function () { state.panelDirty = false; renderPanel(); var b = $("p-discard"); if (b) b.focus(); });

    save.addEventListener("click", function () {
      var doc = {
        salesPm: fSalesPm.value, sa: fSa.value, pm: fPm.value, salesRegion: fSales.value, serviceRegions: chosenService.slice(),
        stage: fStage.value, outcome: fOutcome.value, closeReason: fOutcome.value ? fReason.value.trim() : "",
        closedAt: !fOutcome.value ? "" : fOutcome.value === str(a.outcome) && str(a.closedAt) ? str(a.closedAt) : new Date().toISOString().slice(0, 10),
        fastLane: lane, tcv: amount(fTcv.value) || null,
        nextAction: { text: fNext.value.trim(), who: fWho.value, due: fDue.value }, note: fNote.value.trim(),
        updatedAt: new Date().toISOString(), updatedBy: state.userId || ""
      };
      save.disabled = true; save.setAttribute("aria-busy", "true");
      msg.className = "panel-msg save"; msg.textContent = "Saving…";
      state.db.doc("assign/" + opp.id).set(doc).then(function () {
        state.assign[opp.id] = doc; state.panelDirty = false;
        renderPanel(); renderLists();
        var m = document.querySelector("#panel .panel-msg.save");
        if (m) { m.className = "panel-msg save ok"; m.textContent = "Saved at " + fmtTime.format(new Date()) + "."; }
        var b = $("p-save"); if (b) b.focus();
      }).catch(function (err) {
        save.disabled = false; save.removeAttribute("aria-busy");
        msg.className = "panel-msg save err";
        if (err && err.code === "invalid_argument") {
          state.canWrite = false;
          msg.textContent = "You can view this board but not change it. Ask the owner for Contributor access.";
        } else msg.textContent = "Not saved: the board's data cannot be reached right now. Try again.";
      });
    });

    var box = part("Assignment");
    var sug = opp.suggest || {};
    var fields = { salesPm: fSalesPm, sa: fSa, pm: fPm };
    var open = OWNERS.filter(function (o) { return person(sug[o.key]) && !v[o.key]; });
    if (v.open && open.length) {
      var line = open.map(function (o) { return o.label + " " + person(sug[o.key]).name; }).join(", ");
      var apply = el("button", { type: "button", class: "btn secondary", id: "p-apply", text: "Fill in suggestion" });
      apply.addEventListener("click", function () {
        open.forEach(function (o) { if (!fields[o.key].value) fields[o.key].value = sug[o.key]; });
        dirty(); msg.textContent = "Suggestion filled in for empty fields. Save to keep it."; save.focus();
      });
      box.appendChild(el("div", { class: "panel-suggest" },
        el("p", null, el("strong", { text: "Suggested: " }), line + "."),
        sug.reason ? el("p", { class: "muted", text: str(sug.reason) }) : null,
        el("div", null, apply)));
    }
    box.appendChild(el("div", { class: "panel-grid" },
      field("p-stage", "Stage", fStage),
      el("div", { class: "field" }, el("span", { class: "label", id: "p-lane-label", text: "Lane" }), segLane),
      field("p-tcv", "TCV in EUR", fTcv, v.tcvSuggested ? "Empty: the board shows " + moneyFull(v.tcv) + " from the mails, marked “?”." : null),
      field("p-outcome", "Outcome", fOutcome),
      el("div", { class: "span-2" }, field("p-reason", "Reason for closing", fReason, "No bid, lost and cancelled count in the Analysis page.")),
      field("p-salespm", "Sales PM", fSalesPm), field("p-sa", "Solution Architect", fSa),
      field("p-pm", "Project Manager", fPm), field("p-sales", "Sales region", fSales),
      el("div", { class: "field span-2" }, el("span", { class: "label", id: "p-service-label", text: "Service region" }), segService,
        el("p", { class: "hint", text: autoService ? "Nothing chosen: follows the countries (" + autoService + ")." : "Nothing chosen: no service region." })),
      el("div", { class: "span-2" }, field("p-next", "Next action", fNext, v.next && v.next.suggested ? "Empty: the board shows the suggestion from the mails." : null)),
      field("p-who", "Who", fWho), field("p-due", "Due", fDue),
      el("div", { class: "span-2" }, field("p-note", "Note", fNote))));
    box.appendChild(el("div", { class: "panel-actions" }, save, discard, msg));
    return box;
  }

  function groupingForm(v) {
    var opp = v.opp, existing = state.corrections[opp.id];
    var box = part("Grouping");
    var msg = el("p", { class: "panel-msg", role: "status" });
    if (existing && existing.status !== "done") {
      var target = existing.mergeInto && state.opps[existing.mergeInto] ? str(state.opps[existing.mergeInto].title) : "";
      box.appendChild(el("p", { class: "panel-text", text: "Waiting for the next sync: " + [target ? "merge into “" + target + "”" : "", str(existing.note)].filter(Boolean).join(" · ") }));
      var withdraw = el("button", { type: "button", class: "btn cancel", id: "p-withdraw", text: "Withdraw" });
      withdraw.addEventListener("click", function () {
        withdraw.disabled = true;
        state.db.doc("corrections/" + opp.id).delete().then(function () { delete state.corrections[opp.id]; renderPanel(); var t = $("panel-title"); if (t) t.focus(); })
          .catch(function () { withdraw.disabled = false; msg.className = "panel-msg err"; msg.textContent = "Not withdrawn. Try again."; });
      });
      box.appendChild(el("div", { class: "panel-actions" }, withdraw, msg));
      return box;
    }
    var others = Object.keys(state.opps).filter(function (id) { return id !== opp.id; })
      .map(function (id) { return { id: id, name: str(state.opps[id].title) }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var fMerge = select(others, "", "Do not merge");
    var fNote = el("textarea", { class: "input", rows: "2", maxlength: "500", placeholder: "For example: the mail of 23 Nov belongs to another request" });
    var send = el("button", { type: "button", class: "btn secondary", id: "p-correct", text: "Send to next sync" });
    send.addEventListener("click", function () {
      if (!fMerge.value && !fNote.value.trim()) { msg.className = "panel-msg err"; msg.textContent = "Choose an opportunity to merge with or write a note."; return; }
      var doc = { mergeInto: fMerge.value, note: fNote.value.trim(), status: "open", at: new Date().toISOString(), by: state.userId || "" };
      send.disabled = true;
      state.db.doc("corrections/" + opp.id).set(doc).then(function () { state.corrections[opp.id] = doc; renderPanel(); var t = $("panel-title"); if (t) t.focus(); })
        .catch(function () { send.disabled = false; msg.className = "panel-msg err"; msg.textContent = "Not sent. Try again."; });
    });
    box.appendChild(el("p", { class: "hint", text: "Mails in the wrong opportunity? The next sync applies what you send here." }));
    box.appendChild(field("p-merge", "Merge this opportunity with", fMerge));
    box.appendChild(field("p-fix", "What is wrong", fNote));
    box.appendChild(el("div", { class: "panel-actions" }, send, msg));
    return box;
  }

  /* ---------- team page: workload ---------- */

  var ROLE_ORDER = ["vp", "head-ps", "head-sa", "head-delivery", "head-service-delivery", "sales-pm", "sales-coord", "pm", "sa", "service-delivery", "resourcing"];

  function allViews() { return Object.keys(state.opps).map(function (k) { return view(state.opps[k]); }); }
  function sum(values) { return values.reduce(function (a, b) { return a + b; }, 0); }
  function isOwnerRole(role) { return OWNERS.some(function (o) { return o.role === role; }); }
  function heldBy(views, id) { return views.filter(function (v) { return v.open && (v.salesPm === id || v.sa === id || v.pm === id); }); }

  function kpi(value, label, sub) {
    return el("div", { class: "kpi" }, el("span", { class: "kpi-value", text: value }), el("span", { class: "kpi-label", text: label }),
      sub ? el("span", { class: "kpi-sub", text: sub }) : null);
  }
  function bar(value, max, title) {
    return el("span", { class: "load-track", title: title || null },
      el("span", { class: "load-fill", style: "width:" + (max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100)) : 0) + "%" }));
  }
  function table(heads, rows) {
    var thead = el("tr");
    heads.forEach(function (h) { thead.appendChild(el("th", { scope: "col", class: h.num ? "num" : null, title: h.title || null, text: h.label })); });
    var tbody = el("tbody");
    rows.forEach(function (cells) {
      var tr = el("tr");
      cells.forEach(function (c, i) {
        var td = el("td", { class: heads[i].num ? "num" : null });
        if (c && c.nodeType) td.appendChild(c); else td.textContent = c === null || c === undefined ? "" : String(c);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return el("div", { class: "table-wrap" }, el("table", { class: "dash-table" }, el("thead", null, thead), tbody));
  }
  function card(title, note) {
    var c = el("section", { class: "card board-section" },
      el("div", { class: "board-section-head" }, el("h2", { class: "section-title", text: title }), note ? el("p", { class: "board-section-note", text: note }) : null));
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) c.appendChild(arguments[i]);
    return c;
  }
  function showPerson(id) {
    state.filters = { search: "", show: "open", service: "", sales: "", stage: "", person: id };
    savePrefs(); renderFilters(); location.hash = "#opportunities"; route();
  }

  /* open opportunities of a region that need a role and have nobody in it */
  function unfilled(views, regionId, owner) {
    return views.filter(function (v) {
      var regs = owner.key === "salesPm" ? v.salesRegions : v.serviceRegions;
      return v.need[owner.key] && !v[owner.key] && regs.indexOf(regionId) >= 0;
    }).length;
  }

  function workloadByRole(views) {
    var rows = [], max = 0, data = [];
    regions().forEach(function (r) {
      OWNERS.forEach(function (o) {
        var people = state.people.filter(function (p) { return p.region === r.id && p.role === o.role; });
        var held = sum(people.map(function (p) { return heldBy(views, p.id).length; }));
        var each = people.length ? held / people.length : 0;
        max = Math.max(max, each);
        data.push({ r: r, o: o, people: people.length, held: held, each: each, gap: unfilled(views, r.id, o) });
      });
    });
    data.forEach(function (d) {
      rows.push([str(d.r.name), d.o.label, d.people, d.held,
        d.people ? el("span", { class: "load" }, bar(d.each, max, d.each.toFixed(1) + " open opportunities per person"), el("span", { class: "load-n", text: d.each.toFixed(1) }))
          : el("span", { class: "tag warn", text: "Nobody in this role" }),
        d.gap ? el("span", { class: "tag warn", text: String(d.gap) }) : "0"]);
    });
    return table([{ label: "Region" }, { label: "Role" }, { label: "People", num: true }, { label: "Open opportunities", num: true },
      { label: "Per person" }, { label: "Unfilled", num: true, title: "Open opportunities of the region that need this role and have nobody in it" }], rows);
  }

  function demandByCountry(views) {
    var open = views.filter(function (v) { return v.open; }), by = {};
    open.forEach(function (v) {
      v.countries.forEach(function (c) {
        var d = by[c.code] || (by[c.code] = { c: c, n: 0, tcv: 0, gaps: 0 });
        d.n += 1; d.tcv += v.tcv; if (v.needsOwner) d.gaps += 1;
      });
    });
    var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n || b.tcv - a.tcv || str(a.c.name).localeCompare(str(b.c.name)); });
    var max = rows.length ? rows[0].n : 0;
    return table([{ label: "Country" }, { label: "Region" }, { label: "Open opportunities" }, { label: "TCV", num: true, title: "Full TCV of every open opportunity with a site in the country" },
      { label: "Need an owner", num: true }, { label: "Owners based here", num: true, title: "Sales PMs, Solution Architects and Project Managers whose home country this is" }],
      rows.map(function (d) {
        var based = state.people.filter(function (p) { return p.country === d.c.code && isOwnerRole(p.role); }).length;
        return [countryTag(d.c), d.c.region ? regionName(d.c.region) + (d.c.team && d.c.team !== regionName(d.c.region) ? " · " + d.c.team : "") : "–",
          el("span", { class: "load" }, bar(d.n, max, d.n + " open"), el("span", { class: "load-n", text: String(d.n) })),
          money(d.tcv), d.gaps ? el("span", { class: "tag warn", text: String(d.gaps) }) : "0", based];
      }));
  }

  function personRow(p, views, max) {
    var c = country(str(p.country));
    var mine = heldBy(views, p.id), n = mine.length;
    var owner = isOwnerRole(p.role);
    var split = PHASES.map(function (ph) { var k = mine.filter(function (v) { return v.stage.phase === ph.id; }).length; return k ? k + " " + ph.label.toLowerCase() : ""; }).filter(Boolean).join(", ");
    var count = !owner ? null : el("span", { class: "team-load" },
      bar(n, max, split || "No open opportunity"),
      n ? el("button", { type: "button", class: "linkish team-count", id: "team-" + p.id, text: n + " open", title: split,
        "aria-label": n + " open opportunities of " + str(p.name) + ": " + split, on: { click: function () { showPerson(p.id); } } })
        : el("span", { class: "team-count none", text: "0 open" }),
      el("span", { class: "team-tcv", text: money(sum(mine.map(function (v) { return v.tcv; }))) }));
    return el("li", { class: "team-person" },
      el("span", { class: "team-name" }, el("strong", { text: str(p.name) }), el("span", { class: "sub", text: roleName(p.role) })),
      p.country ? el("span", { class: "tag cond" + (RATE_CLASS[c.rateRegion] ? " " + RATE_CLASS[c.rateRegion] : ""), text: str(c.name) }) : null,
      count);
  }

  function teamCard(title, sub, members, teams, views, max) {
    var c = el("section", { class: "card team-card" },
      el("div", { class: "board-section-head" }, el("h2", { class: "section-title", text: title }), el("span", { class: "ov-count", text: String(members.length) }),
        sub ? el("p", { class: "board-section-note", text: sub }) : null));
    var sorted = members.slice().sort(function (a, b) {
      var d = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
      return d || str(a.name).localeCompare(str(b.name));
    });
    var groups = [{ label: "", people: sorted.filter(function (p) { return p.head || !p.team; }) }];
    uniq(list(teams).concat(sorted.map(function (p) { return p.head ? "" : str(p.team); }))).forEach(function (t) {
      groups.push({ label: t, people: sorted.filter(function (p) { return !p.head && p.team === t; }) });
    });
    groups.forEach(function (g) {
      if (!g.people.length && !g.label) return;
      if (g.label) c.appendChild(el("h3", { class: "team-h", text: g.label }));
      if (!g.people.length) { c.appendChild(el("p", { class: "muted team-none", text: "Nobody yet." })); return; }
      var ul = el("ul", { class: "team-list" });
      g.people.forEach(function (p) { ul.appendChild(personRow(p, views, max)); });
      c.appendChild(ul);
    });
    if (!members.length) c.appendChild(el("p", { class: "muted team-none", text: "Team to be confirmed." }));
    return c;
  }

  function renderTeam() {
    var box = $("team");
    var focusId = document.activeElement && document.activeElement.id && document.activeElement.id.indexOf("team-") === 0 ? document.activeElement.id : null;
    box.textContent = "";
    if (!state.people.length) {
      box.appendChild(el("section", { class: "card board-empty" }, el("p", { class: "empty muted", text: state.loaded.opps ? "No people yet. An editor adds them to the board's master data." : "Loading the team…" })));
      return;
    }
    var views = allViews(), open = views.filter(function (v) { return v.open; });
    var owners = state.people.filter(function (p) { return isOwnerRole(p.role); });
    var loads = owners.map(function (p) { return heldBy(views, p.id).length; });
    var max = Math.max.apply(null, loads.concat([0]));
    var idle = loads.filter(function (n) { return n === 0; }).length;
    box.appendChild(el("section", { class: "card" }, el("div", { class: "kpis" },
      kpi(String(open.length), "Open opportunities", PHASES.map(function (ph) { return open.filter(function (v) { return v.stage.phase === ph.id; }).length + " " + ph.label.toLowerCase(); }).join(" · ")),
      kpi(String(open.filter(function (v) { return v.needsOwner; }).length), "Need an owner", "Missing Sales PM, Solution Architect or Project Manager"),
      kpi(money(sum(open.map(function (v) { return v.tcv; }))), "TCV of open opportunities", open.filter(function (v) { return !v.tcv; }).length + " without a TCV"),
      kpi(String(owners.length), "Owners", idle + " without an open opportunity"),
      kpi(String(max), "Most held by one person", "Open opportunities"))));
    box.appendChild(card("Workload by region and role", "Open opportunities held by the people of each region. There is no capacity figure yet, so load is a count, not a percentage.", workloadByRole(views)));
    box.appendChild(card("Demand by country", "Open opportunities by site country. One with sites in two countries counts in both, with its full TCV.", demandByCountry(views)));
    var grid = el("div", { class: "team-grid" });
    grid.appendChild(teamCard("Group", "Functions that work for every region", state.people.filter(function (p) { return p.region === "global"; }), [], views, max));
    regions().forEach(function (r) {
      grid.appendChild(teamCard(str(r.name), str(r.long), state.people.filter(function (p) { return p.region === r.id; }), list(r.teams), views, max));
    });
    box.appendChild(grid);
    if (focusId && $(focusId)) $(focusId).focus();
  }

  /* ---------- analysis page: pipeline and ratios ---------- */

  function ratios(views) {
    var bid = views.filter(function (v) { return v.isBid; }), noBid = views.filter(function (v) { return v.isNoBid; });
    var won = views.filter(function (v) { return v.isWon; }), lost = views.filter(function (v) { return v.isLost; });
    var pipeline = views.filter(function (v) { return v.open && v.stage.phase === "sell"; });
    return { bid: bid.length, noBid: noBid.length, won: won.length, lost: lost.length, pipeline: pipeline,
      pipelineTcv: sum(pipeline.map(function (v) { return v.tcv; })), wonTcv: sum(won.map(function (v) { return v.tcv; })),
      lostTcv: sum(lost.map(function (v) { return v.tcv; })), cancelled: views.filter(function (v) { return v.isCancelled; }).length };
  }

  function renderAnalysis() {
    var box = $("analysis");
    box.textContent = "";
    var views = allViews();
    if (!state.loaded.opps || !views.length) {
      box.appendChild(el("section", { class: "card board-empty" }, el("p", { class: "empty muted", text: state.loaded.opps ? "No opportunities yet, so there is nothing to analyse." : "Loading…" })));
      return;
    }
    var r = ratios(views), open = views.filter(function (v) { return v.open; });
    var fast = open.filter(function (v) { return v.fastLane; }).length;
    box.appendChild(el("section", { class: "card" }, el("div", { class: "kpis" },
      kpi(money(r.pipelineTcv), "Pre-sales pipeline", r.pipeline.length + " open · " + r.pipeline.filter(function (v) { return !v.tcv; }).length + " without a TCV"),
      kpi(pct(r.bid, r.bid + r.noBid), "Bid rate", r.bid + " bid · " + r.noBid + " no bid"),
      kpi(pct(r.won, r.won + r.lost), "Win rate", r.won + " won · " + r.lost + " lost"),
      kpi(money(r.wonTcv), "Won TCV", "Lost: " + money(r.lostTcv) + " · " + r.cancelled + " cancelled"),
      kpi(pct(fast, open.length), "Fast lane", fast + " of " + open.length + " open"))));

    var stages = STAGES.filter(function (s) { return s.phase === "sell"; }).map(function (s) {
      var here = r.pipeline.filter(function (v) { return v.stage.id === s.id; });
      return { s: s, n: here.length, tcv: sum(here.map(function (v) { return v.tcv; })) };
    });
    var maxN = Math.max.apply(null, stages.map(function (d) { return d.n; }).concat([1]));
    var bars = el("ul", { class: "hbars wide" });
    stages.forEach(function (d) {
      bars.appendChild(el("li", { class: "hbar", title: d.n + " open at " + d.s.name + (d.tcv ? ", " + moneyFull(d.tcv) : "") },
        el("span", { class: "hbar-label", text: d.s.name }),
        el("span", { class: "hbar-track" }, el("span", { class: "hbar-fill", style: "width:" + Math.round((d.n / maxN) * 100) + "%" })),
        el("span", { class: "hbar-value", text: d.n + (d.tcv ? " · " + money(d.tcv) : "") })));
    });
    box.appendChild(card("Open pre-sales by stage", "Number of open opportunities and their TCV at each stage.", bars));

    var rows = regions().map(function (reg) {
      var mine = views.filter(function (v) { return v.salesRegions.indexOf(reg.id) >= 0; }), x = ratios(mine);
      return [str(reg.name), x.pipeline.length, money(x.pipelineTcv), x.bid, x.noBid, pct(x.bid, x.bid + x.noBid), x.won, x.lost, pct(x.won, x.won + x.lost), money(x.wonTcv)];
    });
    box.appendChild(card("By sales region", "An opportunity with two sales regions counts in both.", table(
      [{ label: "Sales region" }, { label: "Open pre-sales", num: true }, { label: "Pipeline TCV", num: true }, { label: "Bid", num: true }, { label: "No bid", num: true },
        { label: "Bid rate", num: true }, { label: "Won", num: true }, { label: "Lost", num: true }, { label: "Win rate", num: true }, { label: "Won TCV", num: true }], rows)));

    var closed = views.filter(function (v) { return v.isNoBid || v.isLost || v.isCancelled; })
      .sort(function (a, b) { return str(b.assign.closedAt).localeCompare(str(a.assign.closedAt)); });
    box.appendChild(card("Closed without a win", "No bid, lost and cancelled, latest first.", closed.length ? table(
      [{ label: "Closed" }, { label: "Opportunity" }, { label: "Outcome" }, { label: "At stage" }, { label: "TCV", num: true }, { label: "Reason" }],
      closed.map(function (v) {
        return [day(v.assign.closedAt) || "–", el("span", { class: "wrap" }, el("strong", { text: str(v.opp.title) }), v.opp.customer ? " · " + str(v.opp.customer) : null),
          statusTag(v), v.stage.name, money(v.tcv), el("span", { class: "wrap", text: str(v.assign.closeReason) || "–" })];
      })) : el("p", { class: "muted", text: "Nothing closed without a win yet." })));

    box.appendChild(el("p", { class: "hint analysis-note", text: "How the figures are counted, over every opportunity on the board: a bid is an opportunity that reached 3.3 Quote cycle or was lost; "
      + "no bid is the outcome “No bid”. Won is everything that reached 6 Closed and was not lost or cancelled, completed projects included. "
      + "Bid rate = bid / (bid + no bid). Win rate = won / (won + lost). Cancelled opportunities count in neither rate. TCV in EUR; a value read from the mails and not confirmed is included." }));
  }

  function route() {
    var page = location.hash === "#team" ? "team" : location.hash === "#analysis" ? "analysis" : "board";
    state.page = page;
    $("page-board").hidden = page !== "board";
    $("page-team").hidden = page !== "team";
    $("page-analysis").hidden = page !== "analysis";
    [["area-board", "board"], ["area-team", "team"], ["area-analysis", "analysis"]].forEach(function (pair) {
      if (pair[1] === page) $(pair[0]).setAttribute("aria-current", "page"); else $(pair[0]).removeAttribute("aria-current");
    });
    if (page === "team") renderTeam(); else if (page === "analysis") renderAnalysis(); else renderLists();
  }

  /* ---------- data ---------- */

  function refresh() {
    if (state.page === "team") renderTeam();
    if (state.page === "analysis") renderAnalysis();
    renderLists();
    if (state.openId && !state.opps[state.openId]) { state.openId = null; state.panelDirty = false; renderPanel(); }
    else if (state.openId && !state.panelDirty && !document.querySelector("#panel :focus:not(.panel-title)")) renderPanel();
  }

  function subscribe(db) {
    var note = $("load-note");
    var slow = setTimeout(function () {
      note.hidden = false;
      note.textContent = "The board's data cannot be reached yet. The page keeps trying; anything shown may be out of date.";
    }, 10000);
    var settled = function (snap) { if (!snap.metadata || !snap.metadata.fromCache) { clearTimeout(slow); note.hidden = true; } };
    var fail = function () {
      clearTimeout(slow); state.failed = true;
      note.hidden = false; note.textContent = "The board's data is not available in this view. Reload the page to try again.";
      renderLists();
    };
    var asMap = function (snap) { var map = {}; snap.docs.forEach(function (d) { var data = d.data(); if (data) { map[d.id] = Object.assign({}, data, { id: d.id }); } }); return map; };

    db.collection("opps").onSnapshot(function (snap) { state.opps = asMap(snap); state.loaded.opps = true; settled(snap); refresh(); }, fail);
    db.collection("assign").onSnapshot(function (snap) { state.assign = asMap(snap); state.loaded.assign = true; refresh(); }, fail);
    db.collection("corrections").onSnapshot(function (snap) { state.corrections = asMap(snap); refresh(); }, function () { /* grouping notes are optional */ });
    db.doc("config/people").onSnapshot(function (snap) { var d = snap.exists ? snap.data() : null; state.people = d ? list(d.people) : []; state.roles = d ? list(d.roles) : []; renderFilters(); refresh(); }, fail);
    db.doc("config/regions").onSnapshot(function (snap) { state.regions = snap.exists ? snap.data() : null; renderFilters(); refresh(); }, fail);
    db.doc("sync/state").onSnapshot(function (snap) { state.sync = snap.exists ? snap.data() : null; renderLists(); }, function () { /* the stamp is optional */ });
  }

  function start() {
    loadPrefs(); wireFilters(); renderFilters(); renderLists();
    window.addEventListener("hashchange", route); route();
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.openId) { e.preventDefault(); closePanel(); }
    });
    var use = window.claude && typeof window.claude.use === "function" ? window.claude.use.bind(window.claude) : null;
    if (!use) {
      state.failed = true; state.loaded.opps = false;
      $("load-note").hidden = false; $("load-note").textContent = "Open this page as a claude.ai artifact to see the board's data.";
      renderLists();
      return;
    }
    use("user").then(function (user) {
      state.user = user;
      if (!user) return null;
      return Promise.all([user.can("data.write"), user.id()]).then(function (res) { state.canWrite = res[0]; state.userId = res[1]; });
    }).catch(function () { /* unknown write level: inputs stay, a refused write decides */ }).then(function () { return use("db"); }).then(function (db) {
      if (!db) {
        state.failed = true;
        $("load-note").hidden = false; $("load-note").textContent = "Sign in to claude.ai with your Evernex account to see the board's data.";
        renderLists();
        return;
      }
      state.db = db;
      subscribe(db);
    });
  }

  start();
})();
