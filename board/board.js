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
  var OUTCOMES = [{ id: "lost", name: "Lost or declined" }, { id: "done", name: "Completed" }];
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
    var outcome = a.outcome === "lost" || a.outcome === "done" ? a.outcome : "";
    var open = !outcome;
    var need = { salesPm: open && stage.phase === "sell", sa: open && stage.phase === "sell", pm: open && stage.phase === "deliver" };
    var ownNext = a.nextAction && str(a.nextAction.text).trim() ? a.nextAction : null;
    var aiNext = opp.nextAction && str(opp.nextAction.text).trim() ? opp.nextAction : null;
    return {
      opp: opp, assign: a, countries: countries,
      stage: stage, outcome: outcome, open: open, need: need,
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
    if (f.show === "done" && v.open) return false;
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
    var region = c.region ? regionName(c.region) + (c.team ? " " + c.team : "") : "";
    return el("span", { class: "tag cond" + (cls ? " " + cls : ""), title: region ? c.name + " · " + region : c.name, text: str(c.name) });
  }

  function statusTag(v) {
    if (v.outcome) return el("span", { class: "status-tag st-" + v.outcome, text: v.outcome === "lost" ? "Lost or declined" : "Completed" });
    return el("span", { class: "status-tag st-" + v.stage.phase + (v.stage.id === "1" ? " st-first" : ""), title: "Stage " + v.stage.id, text: v.stage.name });
  }

  function ownerCell(owner, v) {
    var id = v[owner.key];
    var value = id ? el("span", { class: "opp-v", text: personName(id) || "Unknown person" })
      : v.need[owner.key] ? el("span", { class: "opp-v" }, el("span", { class: "tag warn", text: "Missing" }))
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
      el("span", { class: "req-top" }, statusTag(v),
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

    var current = state.openId === opp.id;
    var btn = el("button", { type: "button", class: "opp-btn", id: "row-" + opp.id, "aria-expanded": current ? "true" : "false", "aria-controls": "panel",
      on: { click: function () { openPanel(opp.id, btn); } } },
      main, ownerCell(OWNERS[0], v), ownerCell(OWNERS[1], v), ownerCell(OWNERS[2], v), deadline, el("span", { class: "opp-go", "aria-hidden": "true", text: "›" }));
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
      if (needs.length) lists.appendChild(section("Needs an owner", "Pre-sales without Sales PM or Solution Architect, delivery without Project Manager. Earliest deadline first.", needs));
      PHASES.forEach(function (ph) {
        var part = shown.filter(function (v) { return v.open && !v.needsOwner && v.stage.phase === ph.id; }).sort(byStageThenRecent);
        var first = STAGES.filter(function (s) { return s.phase === ph.id; });
        if (part.length) lists.appendChild(section(ph.label, "Stages " + first[0].id.split("-")[0] + " to " + first[first.length - 1].id + ", by stage.", part));
      });
      if (done.length) lists.appendChild(section("Lost or completed", "Latest mail first.", done));
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
      if (["open", "done", "all"].indexOf(state.filters.show) < 0) state.filters.show = "open";
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
    add("Stage", v.stage.name + (v.outcome ? " · " + (v.outcome === "lost" ? "Lost or declined" : "Completed") : ""));
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
    [fNext, fNote].forEach(function (c) { c.addEventListener("input", dirty); });
    discard.addEventListener("click", function () { state.panelDirty = false; renderPanel(); var b = $("p-discard"); if (b) b.focus(); });

    save.addEventListener("click", function () {
      var doc = {
        salesPm: fSalesPm.value, sa: fSa.value, pm: fPm.value, salesRegion: fSales.value, serviceRegions: chosenService.slice(),
        stage: fStage.value, outcome: fOutcome.value,
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
      field("p-stage", "Stage", fStage), field("p-outcome", "Outcome", fOutcome),
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

  /* ---------- team page ---------- */

  var ROLE_ORDER = ["vp", "head-ps", "head-sa", "head-delivery", "head-service-delivery", "sales-pm", "sales-coord", "pm", "sa", "service-delivery", "resourcing"];

  function openCount(id) {
    return Object.keys(state.opps).map(function (k) { return view(state.opps[k]); })
      .filter(function (v) { return v.open && (v.salesPm === id || v.sa === id || v.pm === id); }).length;
  }

  function personRow(p) {
    var c = country(str(p.country));
    var n = openCount(p.id);
    var owner = OWNERS.some(function (o) { return o.role === p.role; });
    var count = !owner ? null : n ? el("button", { type: "button", class: "linkish team-count", id: "team-" + p.id, text: n + " open",
      "aria-label": n + " open opportunities of " + str(p.name), on: { click: function () {
        state.filters = { search: "", show: "open", service: "", sales: "", stage: "", person: p.id };
        savePrefs(); renderFilters(); location.hash = "#opportunities"; route();
      } } }) : el("span", { class: "team-count none", text: "0 open" });
    return el("li", { class: "team-person" },
      el("span", { class: "team-name" }, el("strong", { text: str(p.name) }), el("span", { class: "sub", text: roleName(p.role) })),
      p.country ? el("span", { class: "tag cond" + (RATE_CLASS[c.rateRegion] ? " " + RATE_CLASS[c.rateRegion] : ""), text: str(c.name) }) : null,
      count);
  }

  function teamCard(title, sub, members, teams) {
    var card = el("section", { class: "card team-card" },
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
      if (g.label) card.appendChild(el("h3", { class: "team-h", text: g.label }));
      if (!g.people.length) { card.appendChild(el("p", { class: "muted team-none", text: "Nobody yet." })); return; }
      var ul = el("ul", { class: "team-list" });
      g.people.forEach(function (p) { ul.appendChild(personRow(p)); });
      card.appendChild(ul);
    });
    if (!members.length) card.appendChild(el("p", { class: "muted team-none", text: "Team to be confirmed." }));
    return card;
  }

  function renderTeam() {
    var box = $("team");
    var focusId = document.activeElement && document.activeElement.id && document.activeElement.id.indexOf("team-") === 0 ? document.activeElement.id : null;
    box.textContent = "";
    if (!state.people.length) {
      box.appendChild(el("section", { class: "card board-empty" }, el("p", { class: "empty muted", text: state.db ? "No people yet. Editors add them in the board's settings data." : "Loading the team…" })));
      return;
    }
    var grid = el("div", { class: "team-grid" });
    grid.appendChild(teamCard("Group", "Functions that work for every region", state.people.filter(function (p) { return p.region === "global"; }), []));
    regions().forEach(function (r) {
      grid.appendChild(teamCard(str(r.name), str(r.long), state.people.filter(function (p) { return p.region === r.id; }), list(r.teams)));
    });
    box.appendChild(grid);
    if (focusId && $(focusId)) $(focusId).focus();
  }

  function route() {
    var page = location.hash === "#team" ? "team" : "board";
    state.page = page;
    $("page-board").hidden = page !== "board";
    $("page-team").hidden = page !== "team";
    [["area-board", "board"], ["area-team", "team"]].forEach(function (pair) {
      if (pair[1] === page) $(pair[0]).setAttribute("aria-current", "page"); else $(pair[0]).removeAttribute("aria-current");
    });
    if (page === "team") renderTeam(); else renderLists();
  }

  /* ---------- data ---------- */

  function refresh() {
    if (state.page === "team") renderTeam();
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
