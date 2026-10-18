import { collectTags, predictAttendance, rollAttendance } from "./customers.js";

// If the night draws more people than the open rooms can hold,
// the largest groups lose seats first. A pair of regulars keeps their spot
// ahead of a mainstream group that only came because the room was big.
export function fitToCapacity(rows, capacity) {
  const seated = rows.map((row) => ({ ...row }));
  let total = seated.reduce((sum, row) => sum + row.count, 0);
  const limit = Math.max(0, capacity);

  while (total > limit) {
    let biggest = null;
    for (const row of seated) {
      if (!biggest || row.count > biggest.count) biggest = row;
    }
    if (!biggest || biggest.count <= 0) break;
    biggest.count -= 1;
    total -= 1;
  }

  return seated;
}

export function resolveNight({ elements, rooms, customers, regulars, effects, tuning, spendPerGuest, random }) {
  const tags = collectTags(elements, rooms);
  const preview = predictAttendance({
    customers,
    elements,
    regulars,
    effects,
    tuning,
    baseSpend: spendPerGuest
  });
  const rolled = rollAttendance(preview, random);
  const rolledTotal = rolled.reduce((sum, row) => sum + row.count, 0);
  const capacity = rooms.reduce((sum, room) => sum + (room.capacity || 0), 0);
  const rows = fitToCapacity(rolled, capacity);
  const headcount = rows.reduce((sum, row) => sum + row.count, 0);

  return {
    tags,
    capacity,
    rows,
    headcount,
    turnedAway: Math.max(0, rolledTotal - headcount),
    earnings: rows.reduce((sum, row) => sum + row.count * (row.spend || 0), 0)
  };
}
