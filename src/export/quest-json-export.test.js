import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { serializeQuestToJson, questToJsonString } from './quest-json-export.js';
import { buildQuestFromJson } from '../import/quest-json-import.js';
import { state } from '../state/store.js';

beforeEach(() => {
  state.nextPageId = 1;
  state.nextConnId = 1;
});

describe('escaping and dialog newlines (unit-level, no fixtures needed)', () => {
  it('escapes curly apostrophes, angle brackets, and ampersands as \\uXXXX in the output text', () => {
    const quest = {
      id: 'q',
      name: 'Q',
      pages: [{ id: 'p1', pageId: 'p1', title: 'Speaker', fields: [{ key: 'Dialog', value: 'It’s <b>bold</b> & done' }] }],
    };
    const text = questToJsonString(quest);
    expect(text).toContain('\\u2019');
    expect(text).toContain('\\u003c');
    expect(text).toContain('\\u003e');
    expect(text).toContain('\\u0026');
    expect(text).not.toMatch(/[’<>&]/); // none of the literal characters survive
  });

  it('reconstructs a blank line (double newline) from the <br><br> encoding', () => {
    const quest = {
      id: 'q',
      name: 'Q',
      pages: [{ id: 'p1', pageId: 'p1', title: 'Speaker', fields: [{ key: 'Dialog', value: 'First line. <br>  <br> Second line.' }] }],
    };
    const result = serializeQuestToJson(quest);
    expect(result.PageData.p1.Dialog).toBe('First line.\n\nSecond line.');
  });

  it('excludes canvas/layout and connections -- there is no x/y or arrows equivalent in the real schema', () => {
    const quest = {
      id: 'q',
      name: 'Q',
      pages: [{ id: 'p1', pageId: 'p1', title: 'Speaker', x: 123, y: 456, fields: [] }],
    };
    const json = JSON.stringify(serializeQuestToJson(quest));
    expect(json).not.toContain('123');
    expect(json).not.toContain('456');
  });
});

// --- Round-trip against the real "Welcome to Port Haven" questline ---
// These files live in the sibling quests-and-npcs repo (not this one), per
// STORYMAPPER_CONTEXT.md -- they're the actual verification fixtures the
// export feature was built against. Skips gracefully if that sibling repo
// isn't present (e.g. this repo cloned on its own).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WELCOME_DIR = path.resolve(__dirname, '../../../quests-and-npcs/QuestLines/quests/welcome');
const hasFixtures = fs.existsSync(WELCOME_DIR);

describe.skipIf(!hasFixtures)('round-trip against the real welcome questline files', () => {
  const files = hasFixtures ? fs.readdirSync(WELCOME_DIR).filter((f) => f.endsWith('.json')) : [];

  files.forEach((filename) => {
    it(`${filename} survives import -> export unchanged`, () => {
      const original = JSON.parse(fs.readFileSync(path.join(WELCOME_DIR, filename), 'utf8'));
      const built = buildQuestFromJson(original);
      const quest = {
        id: filename.replace(/\.json$/, ''),
        name: original.Title,
        questlineId: original.QuestlineId || null,
        description: built.meta.description,
        repeatable: built.meta.repeatable,
        rewards: built.meta.rewards,
        requirements: built.meta.requirements,
        pages: built.pages,
      };
      const result = serializeQuestToJson(quest, original.QuestlineTitle);
      expect(result).toEqual(original);
    });
  });

  it('found the expected 5 welcome quest files (sanity check that the fixture directory resolved correctly)', () => {
    expect(files.sort()).toEqual(
      ['welcome.json', 'welcome_alderman.json', 'welcome_herald.json', 'welcome_secretary.json', 'welcome_smith.json'].sort()
    );
  });
});
