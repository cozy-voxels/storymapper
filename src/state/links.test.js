import { describe, it, expect } from 'vitest';
import { questsLinkingToWorldItem, linkedWorldItemsForPages } from './links.js';

describe('questsLinkingToWorldItem', () => {
  it('dedupes to one entry per quest even when several pages tag the same NPC', () => {
    const store = {
      quests: {
        q1: {
          name: 'Herald Welcome',
          pages: [
            {linkedNpcIds: ['n1']},
            {linkedNpcIds: ['n1', 'n2']}
          ]
        },
        q2: {name: 'Unrelated Quest', pages: [{linkedNpcIds: ['n2']}]}
      }
    };
    expect(questsLinkingToWorldItem(store, 'npcs', 'n1')).toEqual([
      {id: 'q1', quest: store.quests.q1}
    ]);
  });

  it('sorts results alphabetically by quest name', () => {
    const store = {
      quests: {
        q1: {name: 'Zeta Quest', pages: [{linkedLocationIds: ['l1']}]},
        q2: {name: 'Alpha Quest', pages: [{linkedLocationIds: ['l1']}]}
      }
    };
    const result = questsLinkingToWorldItem(store, 'locations', 'l1');
    expect(result.map(r => r.id)).toEqual(['q2', 'q1']);
  });

  it('returns an empty array when nothing links to the item', () => {
    const store = {quests: {q1: {name: 'Q', pages: [{linkedNpcIds: []}]}}};
    expect(questsLinkingToWorldItem(store, 'npcs', 'n404')).toEqual([]);
  });
});

describe('linkedWorldItemsForPages', () => {
  it('dedupes across pages and skips dangling ids', () => {
    const pages = [
      {linkedNpcIds: ['n1'], linkedLocationIds: ['l1']},
      {linkedNpcIds: ['n1', 'n2'], linkedLocationIds: []}
    ];
    const store = {world: {
      npcs: {n1: {name: 'Herald'}}, // n2 is dangling -- deleted from World
      locations: {l1: {name: 'Port Haven'}}
    }};
    expect(linkedWorldItemsForPages(pages, store)).toEqual({
      npcs: [{id: 'n1', item: {name: 'Herald'}}],
      locations: [{id: 'l1', item: {name: 'Port Haven'}}]
    });
  });

  it('returns empty lists for a quest with no linked pages', () => {
    expect(linkedWorldItemsForPages([{}], {world: {npcs: {}, locations: {}}}))
      .toEqual({npcs: [], locations: []});
  });
});
