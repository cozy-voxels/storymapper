import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateQuest } from './quest-validator.js';
import { validateRequirement } from './requirement-validator.js';
import { validateAction } from './action-validator.js';
import { ValidationReport } from './validation-report.js';
import { buildQuestFromJson } from '../import/quest-json-import.js';
import { state } from '../state/store.js';

beforeEach(() => {
  state.nextPageId = 1;
  state.nextConnId = 1;
});

function fields(pairs){
  return pairs.map(([key, value]) => ({ key, value }));
}

describe('validateRequirement (spot checks across the ported switch)', () => {
  it('flags a quest-state requirement missing its quest id', () => {
    const r = new ValidationReport();
    validateRequirement('questStarted:', 'p', r);
    expect(r.errorCount()).toBe(1);
  });

  it('accepts a well-formed item requirement', () => {
    const r = new ValidationReport();
    validateRequirement('item:Deco_Scroll:1', 'p', r);
    expect(r.errorCount()).toBe(0);
  });

  it('rejects a non-integer quantity', () => {
    const r = new ValidationReport();
    validateRequirement('item:Deco_Scroll:many', 'p', r);
    expect(r.errorCount()).toBe(1);
  });

  it('warns on an unrecognised requirement type', () => {
    const r = new ValidationReport();
    validateRequirement('totallyMadeUp:x', 'p', r);
    expect(r.warningCount()).toBe(1);
    expect(r.issues[0].message).toMatch(/Unrecognised requirement type/);
  });

  it('skips validation entirely for a requirement containing a runtime placeholder', () => {
    const r = new ValidationReport();
    validateRequirement('item:{variable:target_item}:1', 'p', r);
    expect(r.issues).toEqual([]);
  });

  it('unwraps the `!` negation shorthand and validates the inner requirement', () => {
    const r = new ValidationReport();
    validateRequirement('!hasTag:', 'p', r);
    expect(r.errorCount()).toBe(1); // hasTag with no tag name
  });

  it('validates a tracking: tag nested inside hasTag', () => {
    const r = new ValidationReport();
    validateRequirement('hasTag:tracking:kill', 'p', r); // missing the entity id
    expect(r.errorCount()).toBe(1);
  });
});

describe('validateAction (spot checks across the ported switch)', () => {
  it('accepts a well-formed setMarker action', () => {
    const r = new ValidationReport();
    validateAction('setMarker:intro_cormac:Cormac the Smith:88:119:415:Coordinate:00FF00', 'p', r);
    expect(r.errorCount()).toBe(0);
  });

  it('rejects setMarker with a non-numeric coordinate', () => {
    const r = new ValidationReport();
    validateAction('setMarker:id:label:not-a-number:119:415', 'p', r);
    expect(r.errorCount()).toBeGreaterThan(0);
  });

  it('warns on an unrecognised action type -- exactly what a hand-authored prose action hits', () => {
    const r = new ValidationReport();
    validateAction('Starts meet_the_mercs quest', 'p', r);
    expect(r.warningCount()).toBe(1);
    expect(r.issues[0].message).toMatch(/Unrecognised action type/);
  });
});

describe('validateQuest', () => {
  it('flags a prose response action as unrecognised -- the hand-authored-quest scenario this feature exists for', () => {
    const quest = {
      id: 'meet_the_mercs',
      name: 'Meet the Mercs',
      pages: [{
        id: 'p1', pageId: 'meet_the_mercs_notice', title: 'Notice',
        fields: fields([
          ['Dialog', 'Meet some mates.'],
          ['Response(s)', '- Color me intrigued. <br> — Starts **meet_the_mercs** quest'],
        ]),
      }],
    };
    const report = validateQuest(quest, {});
    const messages = report.issues.map((i) => i.message).join('\n');
    expect(messages).toMatch(/Unrecognised action type/);
  });

  it('errors when a page: action targets a page not in this quest', () => {
    const quest = {
      id: 'q', name: 'Q',
      pages: [{ id: 'p1', pageId: 'a', title: 'A', fields: fields([['Response(s)', '- go <br> — page:nonexistent']]) }],
    };
    const report = validateQuest(quest, {});
    expect(report.issues.some((i) => i.message.includes('does not match any page'))).toBe(true);
  });

  it('warns when an AutoTrigger page has no requirements', () => {
    const quest = {
      id: 'q', name: 'Q',
      pages: [{ id: 'p1', pageId: 'a', title: 'A', fields: fields([['AutoTrigger', 'true']]) }],
    };
    const report = validateQuest(quest, {});
    expect(report.issues.some((i) => i.message.includes('fire every HUD tick'))).toBe(true);
  });

  it('errors on a quest with no pages and nothing referencing it', () => {
    const quest = { id: 'orphan', name: 'Orphan', pages: [] };
    const report = validateQuest(quest, { orphan: quest });
    expect(report.issues.some((i) => i.level === 'ERROR' && i.message.includes('will never be evaluated'))).toBe(true);
  });

  it('downgrades to info when another quest references this quest (a state-holder pattern)', () => {
    const holder = { id: 'meet_the_mercs_done', name: 'Done marker', pages: [] };
    const driver = {
      id: 'meet_the_mercs', name: 'Meet the Mercs',
      pages: [{ id: 'p1', pageId: 'a', title: 'A', fields: fields([['Response(s)', '- go <br> — completequest:meet_the_mercs_done']]) }],
    };
    const allQuests = { [holder.id]: holder, [driver.id]: driver };
    const report = validateQuest(holder, allQuests);
    expect(report.issues.some((i) => i.level === 'INFO' && i.message.includes('state holder'))).toBe(true);
    expect(report.issues.some((i) => i.level === 'ERROR')).toBe(false);
  });

  it('warns when economy:take has no matching economy:canafford guard', () => {
    const quest = {
      id: 'q', name: 'Q',
      pages: [{ id: 'p1', pageId: 'a', title: 'A', fields: fields([['Response(s)', '- Buy it <br> — economy:take:50']]) }],
    };
    const report = validateQuest(quest, {});
    expect(report.issues.some((i) => i.message.includes('economy:canafford'))).toBe(true);
  });
});

// --- Sanity check against the real welcome questline: should be clean ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WELCOME_DIR = path.resolve(__dirname, '../../../quests-and-npcs/QuestLines/quests/welcome');
const hasFixtures = fs.existsSync(WELCOME_DIR);

describe.skipIf(!hasFixtures)('validateQuest against the real welcome questline files', () => {
  const files = hasFixtures ? fs.readdirSync(WELCOME_DIR).filter((f) => f.endsWith('.json')) : [];

  files.forEach((filename) => {
    it(`${filename} produces zero errors (it is real, already-live quest content)`, () => {
      const original = JSON.parse(fs.readFileSync(path.join(WELCOME_DIR, filename), 'utf8'));
      const built = buildQuestFromJson(original);
      const quest = {
        id: filename.replace(/\.json$/, ''),
        name: original.Title,
        questlineId: original.QuestlineId || null,
        pages: built.pages,
      };
      const report = validateQuest(quest, {});
      const errors = report.issues.filter((i) => i.level === 'ERROR');
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    });
  });
});
