import { describe, it, expect, beforeEach } from 'vitest';
import { findPageRefs, findQuestStateRefs, buildQuestFromJson, orderPagesByFlow } from './quest-json-import.js';
import { state } from '../state/store.js';

beforeEach(() => {
  state.nextPageId = 1;
  state.nextConnId = 1;
});

describe('findPageRefs', () => {
  it('extracts the target of every page: action', () => {
    expect(findPageRefs(['page:herald_scroll', 'giveItem:Deco_Scroll', 'page:gerald_intro'])).toEqual([
      'herald_scroll',
      'gerald_intro',
    ]);
  });

  it('returns an empty array for undefined/empty input', () => {
    expect(findPageRefs(undefined)).toEqual([]);
    expect(findPageRefs([])).toEqual([]);
  });
});

describe('findQuestStateRefs', () => {
  it('extracts questStarted/questCompleted/etc refs pointing at another quest, with the raw string kept', () => {
    const reqs = ['questStarted:meet_the_mercs', 'questCompleted:intro_quest', 'npcReq:someone', 'questNotStarted:other'];
    expect(findQuestStateRefs(reqs)).toEqual([
      { raw: 'questStarted:meet_the_mercs', questId: 'meet_the_mercs' },
      { raw: 'questCompleted:intro_quest', questId: 'intro_quest' },
      { raw: 'questNotStarted:other', questId: 'other' },
    ]);
  });
});

describe('buildQuestFromJson', () => {
  it('builds pages and follows Response Actions page: refs into labeled connections', () => {
    const qj = {
      Pages: ['p_start', 'p_end'],
      PageData: {
        p_start: {
          Dialog: 'Hello',
          Responses: [{ Text: 'Continue', Actions: ['page:p_end'] }],
        },
        p_end: { Dialog: 'The end' },
      },
    };
    const built = buildQuestFromJson(qj);

    expect(built.pages.map((p) => p.pageId)).toEqual(['p_start', 'p_end']);
    // The Response's own action (page:p_end) is echoed as a "— " sub-line
    // in the Response(s) text, in addition to driving the connection below.
    expect(built.pages[0].fields).toEqual([
      { key: 'Dialog', value: 'Hello' },
      { key: 'Response(s)', value: '- Continue<br>— page:p_end' },
    ]);
    expect(built.connections).toEqual([
      { id: 'w1', from: built.pages[0].id, to: built.pages[1].id, fromSide: 'right', toSide: 'left', label: 'Continue' },
    ]);
  });

  it('falls back to sequential linking for a page that no page: ref ever reaches', () => {
    const qj = {
      Pages: ['a', 'b', 'c'],
      PageData: { a: { Dialog: 'A' }, b: { Dialog: 'B' }, c: { Dialog: 'C' } },
    };
    const built = buildQuestFromJson(qj);
    // no Responses/LoadActions anywhere -> every page is untouched -> sequential fallback for all
    expect(built.connections.map((c) => [c.from, c.to])).toEqual([
      [built.pages[0].id, built.pages[1].id],
      [built.pages[1].id, built.pages[2].id],
    ]);
  });

  it('derives Pages from PageData keys when the Pages array is absent', () => {
    const qj = { PageData: { only_page: { Dialog: 'Solo' } } };
    const built = buildQuestFromJson(qj);
    expect(built.pages).toHaveLength(1);
    expect(built.pages[0].pageId).toBe('only_page');
  });

  it('carries Description/Repeatable/Rewards into meta', () => {
    const qj = {
      Pages: ['a'],
      PageData: { a: {} },
      Description: 'A test quest',
      Repeatable: true,
      Rewards: [{ item: 'Gold', qty: 10 }],
    };
    const built = buildQuestFromJson(qj);
    expect(built.meta).toEqual({ description: 'A test quest', repeatable: true, rewards: [{ item: 'Gold', qty: 10 }] });
  });

  it('keeps `pages` in the source Pages order (the mod\'s real evaluation-priority order) even when it differs from narrative flow, while `layoutOrder` reflects the flow order for layout purposes', () => {
    // Mirrors the real welcome_herald.json shape: the entry point
    // (nothing points at it) is listed LAST in Pages, branches are listed
    // before it -- Pages order encodes evaluation priority, not story order.
    const qj = {
      Pages: ['branch_a', 'branch_b', 'entry'],
      PageData: {
        entry: { Responses: [{ Text: 'go', Actions: ['page:branch_a'] }] },
        branch_a: { Responses: [{ Text: 'next', Actions: ['page:branch_b'] }] },
        branch_b: {},
      },
    };
    const built = buildQuestFromJson(qj);
    expect(built.pages.map((p) => p.pageId)).toEqual(['branch_a', 'branch_b', 'entry']);
    expect(built.layoutOrder.map((p) => p.pageId)).toEqual(['entry', 'branch_a', 'branch_b']);
  });

  it('assigns globally-unique ids by continuing from state.nextPageId/nextConnId', () => {
    state.nextPageId = 5;
    state.nextConnId = 9;
    const qj = { Pages: ['a', 'b'], PageData: { a: { Responses: [{ Text: 'go', Actions: ['page:b'] }] }, b: {} } };
    const built = buildQuestFromJson(qj);
    expect(built.pages.map((p) => p.id)).toEqual(['p5', 'p6']);
    expect(built.connections[0].id).toBe('w9');
  });
});

describe('orderPagesByFlow', () => {
  it('walks outgoing connections breadth-first starting from the page(s) with no incoming arrow', () => {
    const pages = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    // p2 is the real entry point; p1 and p3 both only appear as targets/branches
    const connections = [
      { from: 'p2', to: 'p1' },
      { from: 'p2', to: 'p3' },
    ];
    const ordered = orderPagesByFlow(pages, connections);
    expect(ordered.map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
  });

  it('picks the first page as a fallback root when every page has an incoming arrow (a cycle)', () => {
    const pages = [{ id: 'p1' }, { id: 'p2' }];
    const connections = [
      { from: 'p1', to: 'p2' },
      { from: 'p2', to: 'p1' },
    ];
    const ordered = orderPagesByFlow(pages, connections);
    expect(ordered.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('appends anything unreachable from any root, in its original order', () => {
    const pages = [{ id: 'p1' }, { id: 'p2' }, { id: 'orphan' }];
    const connections = [{ from: 'p1', to: 'p2' }];
    const ordered = orderPagesByFlow(pages, connections);
    expect(ordered.map((p) => p.id)).toEqual(['p1', 'p2', 'orphan']);
  });
});
