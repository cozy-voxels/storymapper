import { describe, it, expect } from 'vitest';
import { publishableStore, setPublishedStore, loadStore, saveStore, orderedQuestlineIds, orderedQuestlineMemberIds } from './store.js';

describe('publishableStore', () => {
  const store = {
    version: 2,
    activeQuestId: 'q1',
    activeQuestlineId: 'ql1',
    quests: {
      q1: {id: 'q1', name: 'Quest', pages: [{id: 'p1'}], trash: [{page: {id: 'p2'}, deletedAt: 1}]}
    },
    questlines: {ql1: {id: 'ql1', name: 'Line'}},
    trashedQuests: [{quest: {id: 'q9'}, deletedAt: 1}],
    trashedQuestlines: [{questline: {id: 'ql9'}, deletedAt: 1}],
    world: {factions: {}, npcs: {n1: {id: 'n1', name: 'Gerald'}}, locations: {}}
  };

  it('strips every kind of trash and the open quest/questline', () => {
    const out = publishableStore(store);
    expect(out.quests.q1.trash).toEqual([]);
    expect(out.trashedQuests).toEqual([]);
    expect(out.trashedQuestlines).toEqual([]);
    expect(out.activeQuestId).toBeNull();
    expect(out.activeQuestlineId).toBeNull();
  });

  it('keeps everything else and leaves the original untouched', () => {
    const out = publishableStore(store);
    expect(out.quests.q1.pages).toEqual([{id: 'p1'}]);
    expect(out.questlines).toEqual(store.questlines);
    expect(out.world).toEqual(store.world);
    expect(store.quests.q1.trash).toHaveLength(1);
    expect(store.trashedQuests).toHaveLength(1);
  });
});

describe('published store (read-only viewer)', () => {
  it('loads a fresh copy on every call and never saves', () => {
    const data = {
      version: 2,
      quests: {q1: {id: 'q1', name: 'Quest', pages: [{id: 'p1', x: 0, y: 0}], connections: []}},
      questlines: {}
    };
    setPublishedStore(JSON.stringify(data));

    const first = loadStore();
    expect(first.quests.q1.name).toBe('Quest');
    first.quests.q1.pages[0].x = 500;
    first.quests.q1.name = 'Changed';
    expect(saveStore(first)).toBe(true);

    const second = loadStore();
    expect(second.quests.q1.name).toBe('Quest');
    expect(second.quests.q1.pages[0].x).toBe(0);
  });
});

describe('questline/quest ordering', () => {
  const store = {
    questlines: {
      qlA: {id: 'qlA'},
      qlB: {id: 'qlB', order: 1},
      qlC: {id: 'qlC', order: 0},
      qlD: {id: 'qlD'}
    },
    quests: {
      q1: {id: 'q1', questlineId: 'qlB'},
      q2: {id: 'q2', questlineId: 'qlA'},
      q3: {id: 'q3', questlineId: 'qlB', order: 0},
      q4: {id: 'q4', questlineId: null, order: 0},
      q5: {id: 'q5', questlineId: 'qlB'}
    }
  };

  it('sorts questlines by order, unordered ones last in creation order', () => {
    expect(orderedQuestlineIds(store)).toEqual(['qlC', 'qlB', 'qlA', 'qlD']);
  });

  it('keeps plain creation order when nothing has been reordered', () => {
    expect(orderedQuestlineIds({questlines: {x: {}, y: {}, z: {}}})).toEqual(['x', 'y', 'z']);
  });

  it('returns only that questline\'s members, sorted by order', () => {
    expect(orderedQuestlineMemberIds(store, 'qlB')).toEqual(['q3', 'q1', 'q5']);
    expect(orderedQuestlineMemberIds(store, 'qlA')).toEqual(['q2']);
    expect(orderedQuestlineMemberIds(store, 'qlD')).toEqual([]);
  });
});
