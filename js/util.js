export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function money(amount) {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${Math.abs(rounded)}`;
}

export function percent(chance) {
  return `${Math.round(chance * 100)}%`;
}

export function signedPercent(amount) {
  const points = Math.round(amount * 100);
  const sign = points > 0 ? "+" : "";
  return `${sign}${points}%`;
}
