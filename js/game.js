import { collectTags, predictAttendance } from "./systems/customers.js";
import { resolveNight } from "./systems/parties.js";
import { canUnlock, collectEffects, findSkill } from "./systems/skills.js";

const SAVE_KEY = "party-lines-v1";
const RULE_KEYS = ["weeklyRent", "spendPerGuest", "horizonWeeks", "skillPointEvery", "planLimit", "attendance"];

function splitStartingState(startingState) {
  const rules = {};
  const state = {};
  for (const [key, value] of Object.entries(startingState)) {
    if (RULE_KEYS.includes(key)) rules[key] = value;
    else state[key] = value;
  }
  return { rules, state };
}

function loadState(initial) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(initial);
    const saved = JSON.parse(raw);
    const next = structuredClone(initial);
    for (const key of Object.keys(initial)) {
      if (saved[key] !== undefined) next[key] = saved[key];
    }
    if (!Array.isArray(next.lines) || !Array.isArray(next.unlockedRooms) || !Array.isArray(next.openRooms)) {
      return structuredClone(initial);
    }
    if (!next.regulars || typeof next.regulars !== "object") next.regulars = {};
    return next;
  } catch {
    return structuredClone(initial);
  }
}

export class Game {
  constructor(data) {
    const { rules, state } = splitStartingState(data.startingState);
    this.data = data;
    this.rules = {
      weeklyRent: rules.weeklyRent ?? 35,
      spendPerGuest: rules.spendPerGuest ?? 12,
      horizonWeeks: rules.horizonWeeks ?? 4,
      skillPointEvery: rules.skillPointEvery ?? 2,
      planLimit: rules.planLimit ?? 5,
      attendance: {
        attractBonus: 0.12,
        avoidPenalty: 0.18,
        cleanMatchBonus: 0.05,
        avoidOnlyMultiplier: 0.4,
        regularBonus: 0.12,
        minChance: 0,
        maxChance: 0.95,
        ...(rules.attendance || {})
      }
    };
    this.initialState = state;
    this.state = loadState(state);
    this.listeners = new Set();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.save();
    for (const listener of this.listeners) listener(this);
  }

  save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
  }

  reset() {
    this.state = structuredClone(this.initialState);
    this.notify();
  }

  effects() {
    return collectEffects(this.data.skills, this.state.unlockedSkills);
  }

  categories() {
    return [this.data.music, this.data.mainAttraction, this.data.dressCode, this.data.activities, this.data.atmosphere];
  }

  catalog() {
    const byId = new Map();
    for (const category of this.categories()) {
      for (const element of category.elements || []) {
        byId.set(element.id, { ...element, slot: category.id });
      }
    }
    return byId;
  }

  planLimit() {
    return Math.max(this.rules.planLimit ?? 5, this.effects().planLimit || 0);
  }

  isElementUnlocked(element) {
    if (!element) return false;
    if (element.startsUnlocked) return true;
    return (this.effects().unlocks || []).includes(element.id);
  }

  elementsByIds(ids) {
    const byId = this.catalog();
    return (ids || []).map((id) => byId.get(id)).filter(Boolean);
  }

  roomsByIds(ids) {
    const byId = new Map(this.data.rooms.map((room) => [room.id, room]));
    return (ids || []).map((id) => byId.get(id)).filter(Boolean);
  }

  getOpenRooms() {
    const unlocked = new Set(this.state.unlockedRooms);
    const open = new Set(this.state.openRooms);
    return this.data.rooms.filter((room) => unlocked.has(room.id) && open.has(room.id));
  }

  lineForWeek(week) {
    return this.state.lines.find((line) => line.week === week) || null;
  }

  preview(elementIds, roomIds) {
    const elements = this.elementsByIds(elementIds);
    const rooms = this.roomsByIds(roomIds);
    const tags = collectTags(elements, rooms);
    const rows = predictAttendance({
      customers: this.data.customers,
      elements,
      regulars: this.state.regulars,
      effects: this.effects(),
      tuning: this.rules.attendance,
      baseSpend: this.rules.spendPerGuest + (this.effects().spendBonus || 0)
    });
    const totalExpected = rows.reduce((sum, row) => sum + row.expected, 0);
    const capacity = rooms.reduce((sum, room) => sum + (room.capacity || 0), 0);
    return { tags, rows, totalExpected, capacity };
  }

  scheduleLine({ week, elementIds, roomIds }) {
    const weekNum = Number(week);
    if (!Number.isInteger(weekNum) || weekNum < this.state.week) {
      return { ok: false, reason: "That week already happened." };
    }

    const existing = this.lineForWeek(weekNum);
    if (existing?.status === "played") {
      return { ok: false, reason: "That night already ran." };
    }

    const elements = this.elementsByIds(elementIds);
    const unstudied = elements.find((element) => !this.isElementUnlocked(element));
    if (unstudied) {
      return { ok: false, reason: `${unstudied.name} is still unstudied.` };
    }
    if (elements.length > this.planLimit()) {
      return { ok: false, reason: `A night can hold ${this.planLimit()} choices.` };
    }
    for (const category of this.categories()) {
      const count = elements.filter((element) => element.slot === category.id).length;
      const min = category.min ?? 0;
      if (count < min) {
        return { ok: false, reason: `Pick ${category.label.toLowerCase()}.` };
      }
      if (category.max != null && count > category.max) {
        return { ok: false, reason: `${category.label} can only hold ${category.max}.` };
      }
    }

    const rooms = this.roomsByIds(roomIds);
    if (!rooms.length) {
      return { ok: false, reason: "Open a room first." };
    }

    const named = elements.find((element) => element.slot === "atmosphere")
      || elements.find((element) => element.slot === "music")
      || elements[0];
    const line = {
      id: `week-${weekNum}`,
      week: weekNum,
      name: named?.name || "Untitled night",
      color: named?.color || "#e4a15c",
      elementIds: elements.map((element) => element.id),
      roomIds: rooms.map((room) => room.id),
      status: "scheduled",
      tags: [],
      result: null
    };

    this.state.lines = this.state.lines.filter((item) => item.week !== weekNum);
    this.state.lines.push(line);
    this.state.lines.sort((a, b) => a.week - b.week);
    this.notify();
    return { ok: true };
  }

  unschedule(week) {
    const line = this.lineForWeek(week);
    if (!line) return { ok: false, reason: "Nothing is planned that week." };
    if (line.status === "played") return { ok: false, reason: "That night already ran." };
    this.state.lines = this.state.lines.filter((item) => item.week !== week);
    this.notify();
    return { ok: true };
  }

  runWeek() {
    const week = this.state.week;
    let line = this.lineForWeek(week);
    const rent = this.rules.weeklyRent;

    if (!line) {
      line = {
        id: `week-${week}`,
        week,
        name: "Doors stayed shut",
        color: "#8a8178",
        elementIds: [],
        roomIds: [],
        status: "played",
        tags: [],
        result: { headcount: 0, earnings: 0, rent, turnedAway: 0, capacity: 0, rows: [] }
      };
      this.state.lines.push(line);
    } else {
      const resolved = resolveNight({
        elements: this.elementsByIds(line.elementIds),
        rooms: this.roomsByIds(line.roomIds),
        customers: this.data.customers,
        regulars: this.state.regulars,
        effects: this.effects(),
        tuning: this.rules.attendance,
        spendPerGuest: this.rules.spendPerGuest + (this.effects().spendBonus || 0)
      });
      line.status = "played";
      line.tags = resolved.tags;
      line.result = {
        headcount: resolved.headcount,
        earnings: resolved.earnings,
        rent,
        turnedAway: resolved.turnedAway,
        capacity: resolved.capacity,
        rows: resolved.rows.map((row) => ({
          id: row.id,
          name: row.name,
          count: row.count,
          isRegular: row.isRegular
        }))
      };
      this.state.money += resolved.earnings;
      for (const row of resolved.rows) {
        if (row.count > 0) {
          this.state.regulars[row.id] = (this.state.regulars[row.id] || 0) + 1;
        }
      }
    }

    this.state.money -= rent;
    this.state.week += 1;
    if (week % this.rules.skillPointEvery === 0) this.state.skillPoints += 1;
    this.state.lines.sort((a, b) => a.week - b.week);
    this.notify();
  }

  unlockSkill(skillId) {
    const skill = findSkill(this.data.skills, skillId);
    const check = canUnlock(skill, this.state);
    if (!check.ok) return check;
    this.state.skillPoints -= skill.cost;
    this.state.unlockedSkills.push(skill.id);
    this.notify();
    return { ok: true };
  }

  unlockRoom(roomId) {
    const room = this.data.rooms.find((item) => item.id === roomId);
    if (!room) return { ok: false, reason: "Unknown room." };
    if (this.state.unlockedRooms.includes(roomId)) {
      return { ok: false, reason: "Already unlocked." };
    }
    if (this.state.money < room.unlockCost) {
      return { ok: false, reason: "Not enough money." };
    }
    this.state.money -= room.unlockCost;
    this.state.unlockedRooms.push(roomId);
    this.notify();
    return { ok: true };
  }

  setRoomOpen(roomId, open) {
    if (!this.state.unlockedRooms.includes(roomId)) {
      return { ok: false, reason: "That room is still locked." };
    }
    const openRooms = new Set(this.state.openRooms);
    if (open) openRooms.add(roomId);
    else openRooms.delete(roomId);
    this.state.openRooms = [...openRooms];
    this.notify();
    return { ok: true };
  }
}
