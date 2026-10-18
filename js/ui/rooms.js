import { escapeHtml, money } from "../util.js";

let message = "";

export function renderRooms(root, game) {
  const cards = game.data.rooms.map((room) => {
    const unlocked = game.state.unlockedRooms.includes(room.id);
    const open = unlocked && game.state.openRooms.includes(room.id);
    const tags = (room.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    let action = "";
    if (!unlocked) {
      const affordable = game.state.money >= room.unlockCost;
      action = `<button type="button" class="button" data-action="unlock" data-id="${room.id}" ${affordable ? "" : "disabled"}>Unlock · ${money(room.unlockCost)}</button>`;
    } else {
      action = `<button type="button" class="button ${open ? "button-ghost" : ""}" data-action="toggle" data-id="${room.id}" data-open="${open ? "false" : "true"}">${open ? "Close tonight" : "Open tonight"}</button>`;
    }
    return `<article class="room-card ${open ? "is-open" : ""}">
      <header>
        <h3>${escapeHtml(room.name)}</h3>
        <span class="pill">${unlocked ? (open ? "Open" : "Closed") : "Locked"}</span>
      </header>
      <p>${escapeHtml(room.summary || "")}</p>
      <p class="fine">Fits ${room.capacity}</p>
      <div class="tags">${tags}</div>
      ${action}
    </article>`;
  }).join("");

  root.innerHTML = `
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>Rooms</h2>
          <p class="lede">You start with two rooms. An open room adds its tags to the night, so the Main Floor can pull a crowd the Small Room would never see.</p>
        </div>
      </header>
      ${message ? `<p class="message">${escapeHtml(message)}</p>` : ""}
      <div class="room-grid">${cards}</div>
    </section>
  `;

  root.onclick = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "unlock") {
      const result = game.unlockRoom(button.dataset.id);
      message = result.ok ? "Room unlocked. Open it when you want it in the night." : result.reason;
      renderRooms(root, game);
      return;
    }
    if (button.dataset.action === "toggle") {
      const result = game.setRoomOpen(button.dataset.id, button.dataset.open === "true");
      message = result.ok ? "" : result.reason;
      renderRooms(root, game);
    }
  };
}
