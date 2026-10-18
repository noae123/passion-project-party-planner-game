import { escapeHtml, money } from "../util.js";

let selectedWeek = null;

function weekRange(game) {
  const lastScheduled = game.state.lines.reduce((max, line) => Math.max(max, line.week), 0);
  const end = Math.max(game.state.week + game.rules.horizonWeeks - 1, lastScheduled, game.state.week);
  const weeks = [];
  for (let week = 1; week <= end; week += 1) weeks.push(week);
  return weeks;
}

export function renderTimeline(root, game, navigate) {
  if (selectedWeek == null) {
    const played = game.state.lines.some((line) => line.status === "played");
    selectedWeek = played ? game.state.week - 1 : game.state.week;
  }

  const weeks = weekRange(game);
  const selected = game.lineForWeek(selectedWeek);
  const cells = weeks.map((week) => {
    const line = game.lineForWeek(week);
    const isCurrent = week === game.state.week;
    const isSelected = week === selectedWeek;
    const classes = [
      "gantt-cell",
      isCurrent ? "is-current" : "",
      isSelected ? "is-selected" : "",
      line?.status === "played" ? "is-played" : ""
    ].filter(Boolean).join(" ");
    const label = line
      ? `<span class="gantt-name">${escapeHtml(line.name)}</span>
         <span class="gantt-meta">${line.status === "played"
           ? `${line.result?.headcount || 0} people`
           : "planned"}</span>`
      : `<span class="gantt-name gantt-name-empty">${week < game.state.week ? "Empty week" : "Open"}</span>
         <span class="gantt-meta">${isCurrent ? "this week" : `week ${week}`}</span>`;
    const bar = line
      ? `<span class="gantt-bar" style="background:${escapeHtml(line.color)}"></span>`
      : "";
    return `<button type="button" class="${classes}" data-action="select" data-week="${week}">
      ${bar}${label}
    </button>`;
  }).join("");

  const detail = renderDetail(game, selected, navigate);

  root.innerHTML = `
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>The line</h2>
          <p class="lede">Each column is a week. A bar is a night you planned. The night uses whatever rooms are open when you put it on the line.</p>
        </div>
      </header>
      <div class="gantt-scroll">
        <div class="gantt-track">${cells}</div>
      </div>
      ${detail}
      <p class="fine">Rent is ${money(game.rules.weeklyRent)} a week. A group with spend 3 pays ${money(game.rules.spendPerGuest)} a person. A 1 pays less, a 5 pays more.</p>
    </section>
  `;

  root.onclick = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const week = Number(button.dataset.week);
    if (button.dataset.action === "select") {
      selectedWeek = week;
      renderTimeline(root, game, navigate);
      return;
    }
    if (button.dataset.action === "plan") {
      navigate("lineCreator", week);
    }
  };
}

function renderDetail(game, line, navigate) {
  const week = selectedWeek;
  if (!line) {
    const future = week >= game.state.week;
    return `
      <div class="detail">
        <h3>Week ${week}</h3>
        <p>${future ? "Nothing is on the line for this week." : "The doors stayed shut, or the week was never planned."}</p>
        ${future ? `<button type="button" class="button" data-action="plan" data-week="${week}">Plan this week</button>` : ""}
      </div>
    `;
  }

  const elements = game.elementsByIds(line.elementIds);
  const rooms = game.roomsByIds(line.roomIds);
  const elementLine = elements.map((element) => escapeHtml(element.name)).join(" · ") || "No theme";
  const roomLine = rooms.map((room) => escapeHtml(room.name)).join(", ") || "No room";
  const result = line.result;
  const arrivals = (result?.rows || []).filter((row) => row.count > 0);
  const arrivalHtml = arrivals.length
    ? `<ul class="people">${arrivals.map((row) =>
        `<li><span>${escapeHtml(row.name)}${row.isRegular ? " · regular" : ""}</span><span>× ${row.count}</span></li>`
      ).join("")}</ul>`
    : "";

  let outcome = "";
  if (line.status === "played" && result) {
    const net = result.earnings - result.rent;
    outcome = `
      <p class="outcome">${result.headcount} people · ${money(result.earnings)} in · ${money(result.rent)} rent · <strong>${net >= 0 ? "+" : ""}${money(net)}</strong></p>
      ${result.turnedAway ? `<p class="fine">${result.turnedAway} more showed up than the rooms could hold. The largest groups were turned away first.</p>` : ""}
      ${result.headcount === 0 ? `<p>The room stayed empty.</p>` : arrivalHtml}
    `;
  }

  const canPlan = line.status !== "played" && week >= game.state.week;

  return `
    <div class="detail">
      <h3>Week ${week} · ${escapeHtml(line.name)}</h3>
      <p>${elementLine}</p>
      <p class="fine">${roomLine}</p>
      ${(line.tags || []).length ? `<div class="tags">${line.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${outcome}
      ${canPlan ? `<button type="button" class="button" data-action="plan" data-week="${week}">Edit this week</button>` : ""}
    </div>
  `;
}
