// Who shows up. Each choice on the night scores every group from 1 to 5.
// The pull for a group is the average of those scores.
// Advertisement can add to it once a night has one.
// Tune the caps in data/startingState.json under "attendance".

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function collectTags(elements, rooms) {
  const tags = new Set();
  for (const element of elements) {
    for (const tag of element.tags || []) tags.add(tag);
  }
  for (const room of rooms) {
    for (const tag of room.tags || []) tags.add(tag);
  }
  return [...tags];
}

export function regularIds(customers, regulars) {
  const ids = new Set();
  for (const customer of customers) {
    const visits = regulars[customer.id] || 0;
    const needed = customer.becomesRegularAfter ?? Infinity;
    if (visits >= needed) ids.add(customer.id);
  }
  return ids;
}

const SPEND_MULTIPLIER = [0, 0.4, 0.7, 1, 1.45, 2];

export function guestSpend(preference, baseSpend) {
  const score = clamp(Math.round(Number(preference) || 3), 1, 5);
  return Math.max(0, Math.round((baseSpend || 0) * SPEND_MULTIPLIER[score]));
}

export function combinedPull(elements, customerId) {
  const scores = [];
  for (const element of elements || []) {
    const raw = element.attraction?.[customerId];
    if (raw == null) continue;
    scores.push(clamp(Number(raw) || 0, 0, 5));
  }
  if (!scores.length) return 0;
  const total = scores.reduce((sum, score) => sum + score, 0);
  return total / scores.length;
}

function pullScore(themeScore, adScore) {
  const theme = clamp(Number(themeScore) || 0, 0, 5);
  const ad = clamp(Math.round(Number(adScore) || 0), 0, 5);
  return clamp(theme + ad, 0, 5);
}

export function attendanceChance(customer, { themeScore, adScore, isRegular, effects, tuning, blocked }) {
  if (blocked) return 0;

  const score = pullScore(themeScore, adScore);
  if (score <= 0) return 0;

  let chance = (score / 5) * tuning.maxChance;
  if (isRegular) {
    chance += tuning.regularBonus + (effects.regularBonus || 0);
  }
  chance += effects.crowdBonus || 0;

  return clamp(chance, tuning.minChance, tuning.maxChance);
}

export function predictAttendance({ customers, elements, advertisement, regulars, effects, tuning, baseSpend }) {
  const regularsSet = regularIds(customers, regulars);
  const adPull = advertisement || {};

  return customers.map((customer) => {
    const visits = regulars[customer.id] || 0;
    const isRegular = regularsSet.has(customer.id);
    const blocked = Boolean(customer.needsRegulars) && regularsSet.size === 0;
    const themeScore = combinedPull(elements, customer.id);
    const adScore = adPull[customer.id] ?? 0;
    const chance = attendanceChance(customer, { themeScore, adScore, isRegular, effects, tuning, blocked });
    const groupSize = customer.groupSize || [1, 1];
    const midpoint = (groupSize[0] + groupSize[1]) / 2;
    return {
      id: customer.id,
      name: customer.name,
      notes: customer.notes || "",
      chance,
      expected: chance * midpoint,
      isRegular,
      visits,
      blocked,
      themeScore,
      adScore: clamp(Math.round(Number(adScore) || 0), 0, 5),
      spendPreference: clamp(Math.round(Number(customer.spend) || 3), 1, 5),
      spend: guestSpend(customer.spend, baseSpend),
      groupSize
    };
  });
}

export function rollAttendance(rows, random = Math.random) {
  return rows.map((row) => {
    if (row.blocked || random() >= row.chance) {
      return { ...row, count: 0 };
    }
    const [min, max] = row.groupSize;
    const count = min + Math.floor(random() * (max - min + 1));
    return { ...row, count };
  });
}
