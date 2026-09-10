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

  it('scans every field, including Requirements/LoadActions', () => {
    const page = {fields: [{key: 'Requirements', value: 'Gerald must be alive'}]};
    expect(suggestLinks(page, makeStore(), {})).toEqual([
      {category: 'npcs', id: 'n2', name: 'Gerald'}
    ]);
  });

  it('scans the page title and freeform fields too', () => {
    const page = {title: 'A favor for Gerald', fields: [{key: 'Custom Note', value: 'Met at Port Haven'}]};
    expect(suggestLinks(page, makeStore(), {})).toEqual([
      {category: 'npcs', id: 'n2', name: 'Gerald'},
      {category: 'locations', id: 'l1', name: 'Port Haven'}
    ]);
  });

  it('matches a full styled name that extends past the NPC name', () => {
    const page = {fields: [
      {key: 'Objectives', value: '{#ca9d6e}{b}Herald of Port Haven the Wanderer{/}{/} needs help.'}
    ]};
    expect(suggestLinks(page, makeStore(), {})).toEqual([
      {category: 'npcs', id: 'n1', name: 'Herald of Port Haven'},
      {category: 'locations', id: 'l1', name: 'Port Haven'}
    ]);
  });

  it('does not match a name found only as part of a longer word', () => {
    const page = {fields: [{key: 'Dialog', value: 'Geraldine waves at you.'}]};
    expect(suggestLinks(page, makeStore(), {})).toEqual([]);
  });

  it('returns an empty array when the page has no matching text', () => {
    const page = {fields: [{key: 'Dialog', value: 'Nothing relevant here.'}]};
    expect(suggestLinks(page, makeStore(), {})).toEqual([]);
  });
});
