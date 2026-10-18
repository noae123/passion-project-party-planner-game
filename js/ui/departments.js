import { escapeHtml } from "../util.js";
import { canUnlock, describeEffects, findSkill } from "../systems/skills.js";

let selectedId = null;
let message = "";

export function renderDepartments(root, game) {
  const departments = game.data.departments;
  if (!selectedId || !departments.some((department) => department.id === selectedId)) {
    selectedId = departments[0]?.id || null;
  }
  const selected = departments.find((department) => department.id === selectedId);
  const skills = selected ? (game.data.skills[selected.id] || []) : [];
  const effects = describeEffects(game.effects());

  const tabs = departments.map((department) => `
    <button type="button" class="dept-tab ${department.id === selectedId ? "is-active" : ""}" data-action="select" data-id="${department.id}">
      ${escapeHtml(department.name)}
    </button>
  `).join("");

  const nodes = skills.length
    ? skills.map((skill) => skillNode(skill, game)).join("")
    : `<p>No skills for this department yet. Add them under “${escapeHtml(selected?.id || "")}” in data/skills.json.</p>`;

  const effectLine = effects.length
    ? `<p class="fine">Right now: ${effects.map((part) => escapeHtml(part)).join("; ")}.</p>`
    : `<p class="fine">No skills learned yet. You have ${game.state.skillPoints} skill point${game.state.skillPoints === 1 ? "" : "s"}.</p>`;

  root.innerHTML = `
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>Departments</h2>
          <p class="lede">Each department has its own skill tree. Learning one spends a skill point. You earn another every ${game.rules.skillPointEvery} weeks you run.</p>
        </div>
      </header>
      ${message ? `<p class="message">${escapeHtml(message)}</p>` : ""}
      ${effectLine}
      <div class="dept-layout">
        <div class="dept-tabs">${tabs}</div>
        <div>
          <h3>${escapeHtml(selected?.name || "")}</h3>
          <p>${escapeHtml(selected?.summary || "")}</p>
          <div class="skill-tree">${nodes}</div>
        </div>
      </div>
    </section>
  `;

  root.onclick = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "select") {
      selectedId = button.dataset.id;
      message = "";
      renderDepartments(root, game);
      return;
    }
    if (button.dataset.action === "learn") {
      const result = game.unlockSkill(button.dataset.id);
      message = result.ok ? "Learned." : result.reason;
      renderDepartments(root, game);
    }
  };
}

function skillNode(skill, game) {
  const learned = game.state.unlockedSkills.includes(skill.id);
  const check = canUnlock(skill, game.state);
  const unmet = (skill.requires || [])
    .filter((id) => !game.state.unlockedSkills.includes(id))
    .map((id) => findSkill(game.data.skills, id)?.name || id);
  const requirement = unmet.length ? `<p class="fine">Needs ${unmet.map((name) => escapeHtml(name)).join(", ")}</p>` : "";
  const button = learned
    ? `<span class="pill">Learned</span>`
    : `<button type="button" class="button" data-action="learn" data-id="${skill.id}" ${check.ok ? "" : "disabled"}>${check.ok ? `Learn · ${skill.cost} point` : escapeHtml(check.reason)}</button>`;

  return `<article class="skill-node ${learned ? "is-learned" : ""}">
    <h4>${escapeHtml(skill.name)}</h4>
    <p>${escapeHtml(skill.summary || "")}</p>
    ${requirement}
    ${button}
  </article>`;
}
