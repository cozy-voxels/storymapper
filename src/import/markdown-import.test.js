import { describe, it, expect, beforeEach } from 'vitest';
import { parseMarkdownTables, tablesToPages, layoutPages } from './markdown-import.js';
import { state } from '../state/store.js';

beforeEach(() => {
  state.nextPageId = 1;
  state.nextConnId = 1;
});

describe('parseMarkdownTables', () => {
  it('parses a single two-column pipe table, dropping the separator row', () => {
    const md = [
      '| NPC Name | Herald |',
      '| --- | --- |',
      '| Page ID | herald_intro |',
      '| Dialog | Hello there |',
    ].join('\n');
    expect(parseMarkdownTables(md)).toEqual([
      [
        ['NPC Name', 'Herald'],
        ['Page ID', 'herald_intro'],
        ['Dialog', 'Hello there'],
      ],
    ]);
  });

  it('joins extra pipe-delimited cells past the second into one value', () => {
    const md = '| Response(s) | Tell me more | Starts quest |';
    expect(parseMarkdownTables(md)).toEqual([[['Response(s)', 'Tell me more | Starts quest']]]);
  });

  it('splits into separate tables when blank/non-table lines interrupt', () => {
    const md = ['| NPC Name | A |', '', 'not a table line', '', '| NPC Name | B |'].join('\n');
    expect(parseMarkdownTables(md)).toEqual([[['NPC Name', 'A']], [['NPC Name', 'B']]]);
  });

  it('returns an empty array for text with no tables', () => {
    expect(parseMarkdownTables('just some prose\nmore prose')).toEqual([]);
  });
});

describe('tablesToPages', () => {
  it('pulls NPC Name and Page ID into their own fields, keeps the rest as fields, and assigns sequential ids', () => {
    const tables = [
      [
        ['NPC Name', 'Herald'],
        ['Page ID', 'herald_intro'],
        ['Dialog', 'Hello there'],
      ],
      [['Dialog', 'No name or id given']],
    ];
    const pages = tablesToPages(tables);
    expect(pages).toEqual([
      { id: 'p1', title: 'Herald', pageId: 'herald_intro', fields: [{ key: 'Dialog', value: 'Hello there' }], x: 0, y: 0 },
      { id: 'p2', title: 'Unnamed NPC', pageId: '—', fields: [{ key: 'Dialog', value: 'No name or id given' }], x: 0, y: 0 },
    ]);
  });

  it('runs Note(s) fields through expandNoteFields', () => {
    const tables = [[['NPC Name', 'X'], ['Note(s)', '- Npc req']]];
    const pages = tablesToPages(tables);
    expect(pages[0].fields).toEqual([{ key: 'Requirements', value: 'Npc req' }]);
  });
});

describe('layoutPages', () => {
  it('lays out pages in a 4-column serpentine grid (alternating direction per row)', () => {
    const pages = Array.from({ length: 9 }, () => ({ x: 0, y: 0 }));
    layoutPages(pages);
    // row 0 (even): left-to-right
    expect(pages[0]).toMatchObject({ x: 40, y: 30 });
    expect(pages[3]).toMatchObject({ x: 40 + 3 * 380, y: 30 });
    // row 1 (odd): right-to-left
    expect(pages[4]).toMatchObject({ x: 40 + 3 * 380, y: 30 + 340 });
    expect(pages[7]).toMatchObject({ x: 40, y: 30 + 340 });
    // row 2 (even again): left-to-right
    expect(pages[8]).toMatchObject({ x: 40, y: 30 + 2 * 340 });
  });
});
