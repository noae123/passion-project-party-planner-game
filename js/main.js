import { Game } from "./game.js";
import { money } from "./util.js";
import { renderTimeline } from "./ui/timeline.js";
import { openOnWeek, renderLineCreator } from "./ui/lineCreator.js";
import { renderDepartments } from "./ui/departments.js";
import { renderRooms } from "./ui/rooms.js";

const DATA_FILES = ["departments", "rooms", "customers", "music", "mainAttraction", "dressCode", "activities", "atmosphere", "skills", "startingState"];

const views = {
  timeline: renderTimeline,
  lineCreator: renderLineCreator,
  departments: renderDepartments,
  rooms: renderRooms
};

let game = null;
let view = "timeline";

const app = document.querySelector("#app");

async function loadData() {
  const entries = await Promise.all(DATA_FILES.map(async (name) => {
    const response = await fetch(`data/${name}.json`);
    if (!response.ok) throw new Error(`${name}.json (${response.status})`);
    return [name, await response.json()];
  }));
  return Object.fromEntries(entries);
}

function renderHeader() {
  const broke = game.state.money < 0 ? "is-debt" : "";
  app.querySelector("#stats").innerHTML = `
    <span>Week ${game.state.week}</span>
    <span class="${broke}">${money(game.state.money)}</span>
    <span>${game.state.skillPoints} skill point${game.state.skillPoints === 1 ? "" : "s"}</span>
  `;
  app.querySelector("#run-week").textContent = `Run week ${game.state.week}`;
}

function draw() {
  renderHeader();
  for (const button of app.querySelectorAll("[data-view]")) {
    button.classList.toggle("is-active", button.dataset.view === view);
  }
  const root = app.querySelector("#view");
  const render = views[view];
  if (view === "timeline") render(root, game, navigate);
  else render(root, game);
}

function navigate(next, week) {
  if (next === "lineCreator" && week != null) openOnWeek(game, week);
  view = next;
  draw();
}

function showError(error) {
  app.innerHTML = `
    <section class="panel error-panel">
      <h1>Party Lines needs a local server</h1>
      <p>The game reads JSON with <code>fetch</code>, so opening the file directly will not load it.</p>
      <p>From this folder, run:</p>
      <pre>python -m http.server 8080</pre>
      <p>Then open <code>http://localhost:8080</code>.</p>
      <p class="fine">${error.message}</p>
    </section>
  `;
}

async function start() {
  try {
    const data = await loadData();
    game = new Game(data);
    game.onChange(draw);
    app.querySelector("#nav").addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      navigate(button.dataset.view);
    });
    app.querySelector("#run-week").addEventListener("click", () => game.runWeek());
    app.querySelector("#reset").addEventListener("click", () => {
      if (window.confirm("Reset the bar back to week 1? This browser’s save will be cleared.")) {
        game.reset();
      }
    });
    draw();
  } catch (error) {
    showError(error);
  }
}

start();
