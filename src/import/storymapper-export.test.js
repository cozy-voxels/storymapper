import { describe, it, expect } from 'vitest';
import { isStorymapperExport } from './storymapper-export.js';

describe('isStorymapperExport', () => {
  it('accepts an "Export all data" store dump', () => {
    expect(isStorymapperExport({
      version: 2,
      activeQuestId: 'q1',
      activeQuestlineId: null,
      quests: {q1: {id: 'q1', name: 'Quest', pages: [], connections: []}},
      questlines: {},
      nextPageId: 2,
      nextConnId: 1,
      world: {factions: {}, npcs: {}, locations: {}},
      trashedQuests: [],
      trashedQuestlines: []
    })).toBe(true);
  });

  it('accepts a dump missing optional sections', () => {
    expect(isStorymapperExport({version: 2, quests: {}})).toBe(true);
  });

  it('rejects a QuestLines quest file', () => {
    expect(isStorymapperExport({Title: 'Quest', Pages: ['a'], PageData: {a: {}}})).toBe(false);
    expect(isStorymapperExport({version: 2, quests: {}, PageData: {}})).toBe(false);
  });

  it('rejects non-objects and incomplete shapes', () => {
    expect(isStorymapperExport(null)).toBe(false);
    expect(isStorymapperExport([])).toBe(false);
    expect(isStorymapperExport('x')).toBe(false);
    expect(isStorymapperExport({version: 2})).toBe(false);
    expect(isStorymapperExport({quests: {}})).toBe(false);
    expect(isStorymapperExport({version: 2, quests: []})).toBe(false);
  });
});
