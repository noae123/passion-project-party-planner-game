import { signedPercent } from "../util.js";

export function allSkills(skillsByDepartment) {
  return Object.values(skillsByDepartment || {}).flat();
}

export function findSkill(skillsByDepartment, skillId) {
  return allSkills(skillsByDepartment).find((skill) => skill.id === skillId) || null;
}

export function canUnlock(skill, state) {
  if (!skill) return { ok: false, reason: "Unknown skill." };
  if (state.unlockedSkills.includes(skill.id)) {
    return { ok: false, reason: "Already learned." };
  }
  const missing = (skill.requires || []).filter((id) => !state.unlockedSkills.includes(id));
  if (missing.length) {
    return { ok: false, reason: "Learn the earlier skill first.", missing };
  }
  if (state.skillPoints < skill.cost) {
    return { ok: false, reason: "Not enough skill points." };
  }
  return { ok: true };
}

export function collectEffects(skillsByDepartment, unlockedIds) {
  const effects = { crowdBonus: 0, regularBonus: 0, spendBonus: 0, tagBonus: {}, planLimit: 0, unlocks: [] };
  const unlocked = new Set(unlockedIds);

  for (const skill of allSkills(skillsByDepartment)) {
    if (!unlocked.has(skill.id)) continue;
    const skillEffects = skill.effects || {};
    effects.crowdBonus += skillEffects.crowdBonus || 0;
    effects.regularBonus += skillEffects.regularBonus || 0;
    effects.spendBonus += skillEffects.spendBonus || 0;
    if (skillEffects.planLimit) effects.planLimit = Math.max(effects.planLimit, skillEffects.planLimit);
    for (const id of skillEffects.unlocks || []) {
      if (!effects.unlocks.includes(id)) effects.unlocks.push(id);
    }
    for (const [tag, bonus] of Object.entries(skillEffects.tagBonus || {})) {
      effects.tagBonus[tag] = (effects.tagBonus[tag] || 0) + bonus;
    }
  }

  return effects;
}

export function describeEffects(effects) {
  const parts = [];
  if (effects.crowdBonus) {
    parts.push(`${signedPercent(effects.crowdBonus)} chance for every kind of guest`);
  }
  if (effects.regularBonus) {
    parts.push(`${signedPercent(effects.regularBonus)} chance for regulars`);
  }
  if (effects.spendBonus) {
    parts.push(`+$${effects.spendBonus} spent per guest`);
  }
  if (effects.planLimit) {
    parts.push(`nights can hold ${effects.planLimit} choices`);
  }
  if (effects.unlocks?.length) {
    parts.push(`${effects.unlocks.length} studied choices`);
  }
  for (const [tag, bonus] of Object.entries(effects.tagBonus || {})) {
    parts.push(`${signedPercent(bonus)} when the night has “${tag}”`);
  }
  return parts;
}
