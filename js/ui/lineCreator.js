import { escapeHtml, money, percent } from "../util.js";

const draft = {
  week: null,
  picks: {},
  message: ""
};

function selectedIds() {
  return Object.values(draft.picks).flat();
}

function formatPull(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function crowdReason(row) {
  if (row.blocked) return "Nobody here is a regular yet.";
  const bits = [];
  if (row.themeScore) bits.push(`combined pull ${formatPull(row.themeScore)} / 5`);
  else bits.push("nothing on the night pulls them");
  if (row.adScore) bits.push(`advertisement ${row.adScore} / 5`);
  if (row.isRegular) bits.push("already a regular");
  return bits.join(" · ");
}

export function openOnWeek(game, week) {
  loadWeek(game, week);
}

function loadWeek(game, week) {
  draft.week = week;
  draft.message = "";
  draft.picks = {};
  const line = game.lineForWeek(week);
  if (!line || line.name === "Doors stayed shut") return;
  for (const element of game.elementsByIds(line.elementIds)) {
    const list = draft.picks[element.slot] || [];
    list.push(element.id);
    draft.picks[element.slot] = list;
  }
}

function ensureDraft(game) {
  if (draft.week == null || draft.week < game.state.week) {
    loadWeek(game, game.state.week);
  }
}

export function renderLineCreator(root, game) {
  ensureDraft(game);

  const slots = game.categories();
  const elements = [...game.catalog().values()];
  const limit = game.planLimit();
  const customers = game.data.customers;
  const knownSlots = new Set(slots.map((slot) => slot.id));
  const openRooms = game.getOpenRooms();
  const line = game.lineForWeek(draft.week);
  const locked = line?.status === "played";
  const ids = selectedIds();
  const preview = game.preview(ids, openRooms.map((room) => room.id));
  const horizon = [];
  for (let week = game.state.week; week < game.state.week + game.rules.horizonWeeks; week += 1) {
    horizon.push(week);
  }

  const slotChips = slots.map((slot) => {
    const chosen = elements.filter((element) => (draft.picks[slot.id] || []).includes(element.id));
    const body = chosen.length
      ? chosen.map((element) => `<button type="button" class="chip" data-action="clear-one" data-slot="${slot.id}" data-id="${element.id}" ${locked ? "disabled" : ""}>${escapeHtml(element.name)}</button>`).join("")
      : `<span class="chip chip-empty">${escapeHtml(emptyLabel(slot))}</span>`;
    return `<div class="slot"><span class="slot-label">${escapeHtml(slot.label)}</span>${body}</div>`;
  }).join("");

  const weekButtons = horizon.map((week) => {
    const planned = game.lineForWeek(week);
    const mark = planned ? (planned.status === "played" ? " · ran" : " · on the line") : "";
    return `<button type="button" class="week-tab ${week === draft.week ? "is-active" : ""}" data-action="week" data-week="${week}">Week ${week}${mark}</button>`;
  }).join("");

  const library = slots.map((slot) => {
    const cards = elements.filter((element) => element.slot === slot.id).map((element) => cardHtml(slot, element, locked, customers, game.isElementUnlocked(element))).join("");
    return `<section class="library-group"><h3>${escapeHtml(slot.label)}</h3><p class="fine">${escapeHtml(slot.summary || "")} ${escapeHtml(rangeLabel(slot))}.</p><div class="cards">${cards}</div></section>`;
  }).join("");

  const unslotted = elements.filter((element) => !knownSlots.has(element.slot));
  const unslottedHtml = unslotted.length
    ? `<section class="library-group"><h3>Check the slot id</h3><div class="cards">${unslotted.map((element) =>
        `<article class="card"><h4>${escapeHtml(element.name)}</h4><p>slot “${escapeHtml(element.slot)}” does not match a category file.</p></article>`
      ).join("")}</div></section>`
    : "";

  const tags = preview.tags.length
    ? preview.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")
    : `<span class="fine">No tags yet.</span>`;

  const roomLine = openRooms.length
    ? openRooms.map((room) => `${escapeHtml(room.name)} (${room.capacity})`).join(", ")
    : "No room is open.";

  const crowd = [...preview.rows].sort((a, b) => b.chance - a.chance).map((row) => {
    const dim = row.chance < 0.08 ? "is-dim" : "";
    const about = row.expected >= 0.5 ? `about ${Math.round(row.expected)}` : "unlikely";
    return `<li class="crowd-row ${dim}">
      <div class="crowd-top"><span>${escapeHtml(row.name)}${row.isRegular ? " · regular" : ""}</span><span>${percent(row.chance)}</span></div>
      <p>${about} · spends ${money(row.spend)} · ${escapeHtml(crowdReason(row))}</p>
    </li>`;
  }).join("");

  const fitNote = preview.totalExpected > preview.capacity && preview.capacity > 0
    ? `<p class="warning">About ${Math.round(preview.totalExpected)} people want in. The open rooms fit ${preview.capacity}. The largest groups are turned away first.</p>`
    : `<p class="fine">About ${Math.round(preview.totalExpected)} people · rooms fit ${preview.capacity}.</p>`;

  root.innerHTML = `
    <div class="workshop">
      <section class="panel sheet">
        <header class="panel-head">
          <div>
            <h2>Line creator</h2>
            <p class="lede">A night holds ${limit} choices. Music and atmosphere need at least one, dress code is exactly one, and the draw and the activities can be left off. Each choice scores every group from 1 to 5, and who comes is the average. Study in Programming to unlock more choices. A later skill raises a night to 10.</p>
          </div>
        </header>
        <div class="week-tabs">${weekButtons}</div>
        ${draft.message ? `<p class="message">${escapeHtml(draft.message)}</p>` : ""}
        <div class="slots">${slotChips}</div>
        <div class="tag-row">${tags}</div>
        <p class="fine">${ids.length} of ${limit} choices. Open tonight: ${roomLine}.</p>
        <div class="row-actions">
          ${locked
            ? `<p class="fine">This night already happened.</p>`
            : `<button type="button" class="button" data-action="schedule">Put this night on the line</button>
               ${line && line.status !== "played" ? `<button type="button" class="button button-ghost" data-action="unschedule">Take it off</button>` : ""}`}
        </div>
      </section>
      <aside class="panel crowd">
        <h2>Who might come</h2>
        <ul class="crowd-list">${crowd}</ul>
        ${fitNote}
      </aside>
      <section class="panel library">
        ${library}
        ${unslottedHtml}
      </section>
    </div>
  `;

  root.onclick = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || locked && button.dataset.action !== "week") return;
    const action = button.dataset.action;

    if (action === "week") {
      loadWeek(game, Number(button.dataset.week));
      renderLineCreator(root, game);
      return;
    }
    if (locked) return;

    if (action === "pick") {
      const slot = slots.find((item) => item.id === button.dataset.slot);
      togglePick(slot, button.dataset.id, game);
      renderLineCreator(root, game);
      return;
    }
    if (action === "clear-one") {
      const list = draft.picks[button.dataset.slot] || [];
      draft.picks[button.dataset.slot] = list.filter((id) => id !== button.dataset.id);
      draft.message = "";
      renderLineCreator(root, game);
      return;
    }
    if (action === "schedule") {
      const result = game.scheduleLine({
        week: draft.week,
        elementIds: selectedIds(),
        roomIds: game.getOpenRooms().map((room) => room.id)
      });
      draft.message = result.ok ? "It’s on the line." : result.reason;
      renderLineCreator(root, game);
      return;
    }
    if (action === "unschedule") {
      const result = game.unschedule(draft.week);
      if (result.ok) draft.picks = {};
      draft.message = result.ok ? "Taken off the line." : result.reason;
      renderLineCreator(root, game);
    }
  };
}

function emptyLabel(slot) {
  if ((slot.min ?? 0) >= 1 && slot.max === 1) return "Exactly 1";
  if ((slot.min ?? 0) >= 1) return `At least ${slot.min}`;
  return "Optional";
}

function rangeLabel(slot) {
  if ((slot.min ?? 0) === 1 && slot.max === 1) return "Exactly one";
  if ((slot.min ?? 0) >= 1) return "At least one, up to the night’s limit";
  return "Optional, up to the night’s limit";
}

function togglePick(slot, elementId, game) {
  const element = game.catalog().get(elementId);
  if (!game.isElementUnlocked(element)) {
    draft.message = "Study that choice in Programming first.";
    return;
  }
  const list = draft.picks[slot.id] || [];
  if (list.includes(elementId)) {
    draft.picks[slot.id] = list.filter((id) => id !== elementId);
    draft.message = "";
    return;
  }
  const max = slot.max ?? Infinity;
  if (list.length >= max) {
    if (max === 1) {
      draft.picks[slot.id] = [elementId];
      draft.message = "";
      return;
    }
    draft.message = `${slot.label} is full. Remove one first.`;
    return;
  }
  if (selectedIds().length >= game.planLimit()) {
    draft.message = `A night can hold ${game.planLimit()} choices.`;
    return;
  }
  draft.picks[slot.id] = [...list, elementId];
  draft.message = "";
}

function cardHtml(slot, element, nightLocked, customers, studied) {
  const selected = (draft.picks[slot.id] || []).includes(element.id);
  const tags = element.attraction
    ? customers.map((customer) => {
        const score = element.attraction[customer.id];
        const shown = score == null ? "–" : score;
        return `<span class="tag">${escapeHtml(customer.name)} ${shown}</span>`;
      }).join("")
    : (element.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const copy = studied ? (element.summary || "") : "Unstudied. Learn it in Programming.";
  return `<button type="button" class="card ${selected ? "is-selected" : ""} ${studied ? "" : "is-locked"}" data-action="pick" data-slot="${escapeHtml(slot.id)}" data-id="${escapeHtml(element.id)}" ${nightLocked || !studied ? "disabled" : ""}>
    <span class="card-swatch" style="background:${escapeHtml(element.color || "#e4a15c")}"></span>
    <span class="card-body">
      <span class="card-title">${escapeHtml(element.name)}</span>
      ${copy ? `<span class="card-copy">${escapeHtml(copy)}</span>` : ""}
      <span class="tags">${tags}</span>
    </span>
  </button>`;
}
