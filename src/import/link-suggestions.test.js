import { describe, it, expect } from 'vitest';
import { suggestLinks } from './link-suggestions.js';

function makeStore(){
  return {
    world: {
      npcs: {
        n1: {name: 'Herald of Port Haven'},
        n2: {name: 'Gerald'}
      },
      locations: {
        l1: {name: 'Port Haven'}
      }
    }
  };
}

describe('suggestLinks', () => {
  it('suggests an NPC whose name appears in the page text, even wrapped in QL style tags', () => {
    const page = {fields: [
      {key: 'Dialog', value: '{#ca9d6e}{b}Herald of Port Haven{/}{/} waves at you.'}
    ]};
    const suggestions = suggestLinks(page, makeStore(), {});
    expect(suggestions).toEqual([
      {category: 'npcs', id: 'n1', name: 'Herald of Port Haven'},
      {category: 'locations', id: 'l1', name: 'Port Haven'}
    ]);
  });

  it('excludes ids already linked', () => {
    const page = {fields: [{key: 'Dialog', value: 'Herald of Port Haven waves at you.'}]};
    const suggestions = suggestLinks(page, makeStore(), {npcs: ['n1'], locations: ['l1']});
    expect(suggestions).toEqual([]);
  });

  it('only scans the known prose fields, not Requirements/LoadActions', () => {
    const page = {fields: [{key: 'Requirements', value: 'Gerald must be alive'}]};
    expect(suggestLinks(page, makeStore(), {})).toEqual([]);
  });

  it('returns an empty array when the page has no matching text', () => {
    const page = {fields: [{key: 'Dialog', value: 'Nothing relevant here.'}]};
    expect(suggestLinks(page, makeStore(), {})).toEqual([]);
  });
});
