import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  formatInline,
  formatCardTitle,
  splitLines,
  responseChoicesForPage,
  renderBulletField,
  looksLikeBulletField,
  renderSimpleList,
  classifyNoteLines,
  expandNoteFields,
  compareNames,
  plainTextForMatching,
} from './text.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<b>"AT&T"</b>')).toBe('&lt;b&gt;&quot;AT&amp;T&quot;&lt;/b&gt;');
  });
});

describe('formatInline', () => {
  it('converts **bold** and *italic* markdown', () => {
    expect(formatInline('**bold** and *italic*')).toBe('<strong>bold</strong> and <em>italic</em>');
  });

  it('normalizes <br> variants and does not escape them', () => {
    expect(formatInline('a<br>b<br/>c<br />d')).toBe('a<br>b<br>c<br>d');
  });

  it('escapes raw HTML in surrounding text', () => {
    expect(formatInline('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
  });

  it('strips known style tags but keeps variable placeholders', () => {
    expect(formatInline('{b}bold{/} {#ff00aa}color{/} {username} {variable:max_arena2_bribe}'))
      .toBe('bold color {username} {variable:max_arena2_bribe}');
  });

  it('returns an empty string for falsy input', () => {
    expect(formatInline('')).toBe('');
    expect(formatInline(null)).toBe('');
  });

  it('trims the final result', () => {
    expect(formatInline('  hello  ')).toBe('hello');
  });
});

describe('formatCardTitle', () => {
  it('strips any {...} tag entirely, unlike formatInline', () => {
    expect(formatCardTitle('{#ff00aa}Gerald{/} the {username}')).toBe('Gerald the');
  });

  it('returns an empty string for falsy input', () => {
    expect(formatCardTitle('')).toBe('');
  });
});

describe('splitLines', () => {
  it('splits on <br> variants, trims, and drops empties', () => {
    expect(splitLines('a <br> b<br/> <br/> c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('responseChoicesForPage', () => {
  it('extracts only top-level response lines, not the — sub-lines', () => {
    const page = {
      fields: [
        { key: 'Dialog', value: 'irrelevant' },
        {
          key: 'Response(s)',
          value: '- Tell me more. <br> — Starts quest <br> - Maybe later. <br> — No change.',
        },
      ],
    };
    expect(responseChoicesForPage(page)).toEqual(['Tell me more.', 'Maybe later.']);
  });

  it('returns an empty array when there is no Response(s) field', () => {
    expect(responseChoicesForPage({ fields: [] })).toEqual([]);
  });
});

describe('looksLikeBulletField', () => {
  it('detects a leading - or — bullet, at the start or after a <br>', () => {
    expect(looksLikeBulletField('- first line')).toBe(true);
    expect(looksLikeBulletField('intro <br> — nested')).toBe(true);
  });

  it('returns false for plain prose', () => {
    expect(looksLikeBulletField('just a sentence')).toBe(false);
  });
});

describe('renderBulletField', () => {
  it('nests — sub-lines under the preceding - line', () => {
    const html = renderBulletField('- Tell me more. <br> — Starts quest <br> - Maybe later.', 'plain');
    expect(html).toBe(
      '<ul class="bullet-list tone-plain">' +
        '<li class="">Tell me more.</li>' +
        '<ul class="bullet-sub"><li>Starts quest</li></ul>' +
        '<li class="">Maybe later.</li>' +
        '</ul>'
    );
  });

  it('returns an empty string for an empty field', () => {
    expect(renderBulletField('', 'plain')).toBe('');
  });
});

describe('renderSimpleList', () => {
  it('wraps each item in its own <li>', () => {
    expect(renderSimpleList(['a', 'b'], 'plain')).toBe(
      '<ul class="bullet-list tone-plain"><li>a</li><li>b</li></ul>'
    );
  });

  it('returns an empty string for no items', () => {
    expect(renderSimpleList([], 'plain')).toBe('');
    expect(renderSimpleList(null, 'plain')).toBe('');
  });
});

describe('classifyNoteLines', () => {
  it('buckets lines into Requirements/Objectives/LoadActions by prefix, defaulting bare lines to Requirements', () => {
    const raw = [
      'Requirement(s):',
      '- Npc req',
      "- Objective(s): Talk to the Herald",
      '- Load Action: Remove map marker',
      '- Quest **meet_the_mercs** started',
    ].join(' <br> ');
    expect(classifyNoteLines(raw)).toEqual({
      reqs: ['Npc req', 'Quest **meet_the_mercs** started'],
      objs: ['Talk to the Herald'],
      loads: ['Remove map marker'],
    });
  });
});

describe('expandNoteFields', () => {
  it('splits a Note(s) field into Requirements/Objectives/LoadActions and passes other fields through', () => {
    const fields = [
      { key: 'Dialog', value: 'Hello' },
      { key: 'Note(s)', value: '- Npc req <br> - Objective(s): Do the thing' },
    ];
    expect(expandNoteFields(fields)).toEqual([
      { key: 'Dialog', value: 'Hello' },
      { key: 'Requirements', value: 'Npc req' },
      { key: 'Objectives', value: 'Do the thing' },
    ]);
  });

  it('leaves fields alone when there is no Note(s)/Notes field', () => {
    const fields = [{ key: 'Dialog', value: 'Hello' }];
    expect(expandNoteFields(fields)).toEqual(fields);
  });
});

describe('compareNames', () => {
  it('sorts case-insensitively', () => {
    expect(['banana', 'Apple', 'cherry'].sort(compareNames)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('treats a falsy name as an empty string', () => {
    expect(compareNames(null, 'a')).toBeLessThan(0);
  });
});

describe('plainTextForMatching', () => {
  it('reduces a name wrapped in QL style tags to plain text', () => {
    expect(plainTextForMatching('{#ca9d6e}{b}Herald of Port Haven{/}{/}')).toBe('Herald of Port Haven');
  });

  it('keeps variable placeholders, unlike the style tags', () => {
    expect(plainTextForMatching('Hello, {username}.')).toBe('Hello, {username}.');
  });

  it('turns <br> into a space and drops markdown markers', () => {
    expect(plainTextForMatching('**Gerald**<br>is here')).toBe('Gerald is here');
  });

  it('returns an empty string for falsy input', () => {
    expect(plainTextForMatching('')).toBe('');
  });
});
