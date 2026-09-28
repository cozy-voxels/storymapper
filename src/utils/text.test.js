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
  parseResponses,
  serializeResponses,
  renderResponses,
  normalizeBr,
  brToText,
  textToBr,
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

  it('also splits on real line breaks, not just <br>', () => {
    expect(splitLines('a\nb\r\nc <br> d')).toEqual(['a', 'b', 'c', 'd']);
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

describe('parseResponses', () => {
  it('splits into responses, bucketing — requires: into requirements and other — lines into actions', () => {
    const raw = '- Color me intrigued. <br> — requires: itemOwned:token <br> — Starts meet_the_mercs quest <br> - Maybe later.';
    expect(parseResponses(raw)).toEqual([
      { text: 'Color me intrigued.', requirements: ['itemOwned:token'], actions: ['Starts meet_the_mercs quest'] },
      { text: 'Maybe later.', requirements: [], actions: [] },
    ]);
  });

  it('drops a stray — sub-line with no preceding response', () => {
    expect(parseResponses('— orphaned')).toEqual([]);
  });

  it('returns an empty array for falsy input', () => {
    expect(parseResponses('')).toEqual([]);
    expect(parseResponses(null)).toEqual([]);
  });

  it('treats a leading line with no dash at all as the single response, when a page only has one choice', () => {
    // Real fixture, from data/storymapper-export-2026-09-13.json's
    // edme_default page -- with only one response to show, the author
    // skipped the "- " entirely, which previously made the whole response
    // invisible (no line matched, so parseResponses returned []).
    const raw = "You're rather odd, you know.<br> Action(s): <br> — chat:Edme will have more to share soon.";
    expect(parseResponses(raw)).toEqual([
      { text: "You're rather odd, you know.", requirements: [], actions: ['chat:Edme will have more to share soon.'] },
    ]);
  });

  it('still drops a stray — sub-line or bare label at the very start, with nothing to attach it to', () => {
    expect(parseResponses('Action(s): foo')).toEqual([]);
  });

  it('handles hand-typed data: real newlines between responses, and a bare "Action(s):"/"Requirement(s):" label line whose items follow on their own (possibly un-prefixed) lines', () => {
    // Real fixture, from data/storymapper-export-2026-09-13.json's
    // broomseller_event_hub page -- mixes <br> and literal \n as response
    // separators, and labels a section with its own bare line rather than
    // repeating "— requires:"/"— action" on every item.
    const raw =
      '- What\'s the difference between the brooms? <br> Action(s): <br> — page:broomseller_event_broom_types\n' +
      '- How do I craft a **starweave broom**? <br> — Requirement(s): Does NOT have requisite tufts and/or sticks <br> — Action(s): page:broomseller_event_crafting\n' +
      '- I want to craft or buy a broom <br> Action(s): <br> page:broomseller_event_brooms\n' +
      '- Nothing else, thanks.';
    expect(parseResponses(raw)).toEqual([
      { text: "What's the difference between the brooms?", requirements: [], actions: ['page:broomseller_event_broom_types'] },
      { text: 'How do I craft a **starweave broom**?', requirements: ['Does NOT have requisite tufts and/or sticks'], actions: ['page:broomseller_event_crafting'] },
      { text: 'I want to craft or buy a broom', requirements: [], actions: ['page:broomseller_event_brooms'] },
      { text: 'Nothing else, thanks.', requirements: [], actions: [] },
    ]);
  });
});

describe('serializeResponses', () => {
  it('is the inverse of parseResponses', () => {
    const responses = [
      { text: 'Color me intrigued.', requirements: ['itemOwned:token'], actions: ['Starts meet_the_mercs quest'] },
      { text: 'Maybe later.', requirements: [], actions: [] },
    ];
    const raw = serializeResponses(responses);
    expect(raw).toBe('- Color me intrigued.<br>— requires: itemOwned:token<br>— Starts meet_the_mercs quest<br>- Maybe later.');
    expect(parseResponses(raw)).toEqual(responses);
  });

  it('drops a response with no text and no requirements/actions', () => {
    expect(serializeResponses([{ text: '', requirements: [], actions: [] }])).toBe('');
  });

  it('trims blank requirement/action lines out', () => {
    const raw = serializeResponses([{ text: 'Go', requirements: ['', '  '], actions: [''] }]);
    expect(raw).toBe('- Go');
  });
});

describe('renderResponses', () => {
  it('renders a labeled Requires/Actions sub-list only when present', () => {
    const html = renderResponses([
      { text: 'Choice A', requirements: ['req1'], actions: ['act1'] },
      { text: 'Choice B', requirements: [], actions: [] },
    ]);
    expect(html).toBe(
      '<ul class="bullet-list tone-response">' +
        '<li>Choice A</li>' +
        '<ul class="bullet-sub">' +
          '<li class="label-line">Requires:</li><li>req1</li>' +
          '<li class="label-line">Actions:</li><li>act1</li>' +
        '</ul>' +
        '<li>Choice B</li>' +
        '</ul>'
    );
  });

  it('returns an empty string for no responses', () => {
    expect(renderResponses([])).toBe('');
  });
});

describe('normalizeBr', () => {
  it('normalizes any <br> variant/spacing to the canonical unpadded token', () => {
    expect(normalizeBr('a<br>b<br/>c<BR />d <br>  e')).toBe('a<br>b<br>c<br>d<br>e');
  });

  it('returns falsy input unchanged', () => {
    expect(normalizeBr('')).toBe('');
    expect(normalizeBr(undefined)).toBe(undefined);
  });
});

describe('brToText / textToBr', () => {
  it('converts <br> to real line breaks for display, keeping blank lines', () => {
    expect(brToText('First line. <br>  <br> Second line.')).toBe('First line.\n\nSecond line.');
  });

  it('is stable across repeated save/reopen round trips', () => {
    const once = textToBr(brToText('a <br> b'));
    expect(once).toBe('a<br>b');
    expect(textToBr(brToText(once))).toBe('a<br>b');
  });

  it('writes <br> with no surrounding spaces, including adjacent blank-line breaks', () => {
    expect(textToBr('a \n\n  b')).toBe('a<br><br>b');
  });

  it('strips padding already accumulated around <br> in stored values', () => {
    expect(brToText('a        <br>         b')).toBe('a\nb');
  });

  it('converts real line breaks back to <br>, and re-parses the same as the original', () => {
    const stored = 'First line. <br>  <br> Second line.';
    const roundTripped = textToBr(brToText(stored));
    expect(splitLines(roundTripped)).toEqual(splitLines(stored));
  });

  it('returns an empty string for falsy input', () => {
    expect(brToText('')).toBe('');
    expect(brToText(null)).toBe('');
    expect(textToBr('')).toBe('');
    expect(textToBr(null)).toBe('');
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
