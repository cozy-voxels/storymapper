import { splitLines } from '../utils/text.js';

/* ================= JSON quest export (QuestLines mod format) =================
   The inverse of buildQuestFromJson (src/import/quest-json-import.js) --
   turns one of this app's internal quest records back into the real
   QuestLines quest JSON shape, per QUEST_GUIDE.md / ql_data-models.md.
   Deliberately excludes canvas-only data (page x/y, connections/arrows)
   and World/setting data -- neither has any equivalent in the real
   schema, and connections are re-derived here from the Response(s)
   field text instead (the same text that findPageRefs/buildQuestFromJson
   originally encoded them into on import). */

function fieldValue(fields, key){
  var match = (fields || []).filter(function(f){ return f.key.toLowerCase() === key; })[0];
  return match ? match.value : undefined;
}

/* Reverses jsonLinesToBr(): the app displays a multi-line Dialog/
   JournalText field as ' <br> '-joined text, the real schema wants a
   plain string with real newlines. */
function brToNewlines(raw){
  if(!raw) return undefined;
  return raw.split(/\s*<br\s*\/?>\s*/i).join('\n');
}

/* Reverses the Response(s) field encoding buildQuestFromJson writes:
   each response is a "- Text" line, optionally followed by "— requires: X"
   lines (-> Requirements) and other "— Y" lines (-> Actions, verbatim).
   Note this only recovers real Requirements/Actions for quests that were
   JSON-imported (or hand-authored using real QL action/requirement
   strings after "— ") -- a quest hand-authored with prose annotations
   there (e.g. "— Starts the_quest quest") will export those prose lines
   as literal (invalid) Actions, same as if they'd been typed into a real
   quest file's Responses.Actions by hand. */
function parseResponseField(raw){
  if(!raw) return undefined;
  var responses = [];
  var current = null;
  splitLines(raw).forEach(function(line){
    if(/^—/.test(line)){
      if(!current) return; // a stray sub-line with no preceding "- " choice; nothing to attach it to
      var sub = line.replace(/^—\s*/, '');
      var reqMatch = /^requires:\s*(.*)$/i.exec(sub);
      if(reqMatch){
        current.Requirements = current.Requirements || [];
        current.Requirements.push(reqMatch[1]);
      } else {
        current.Actions = current.Actions || [];
        current.Actions.push(sub);
      }
    } else {
      current = {Text: line.replace(/^-\s*/, '')};
      responses.push(current);
    }
  });
  return responses.length ? responses : undefined;
}

function serializePage(page){
  var fields = page.fields || [];
  var out = {};
  // Always present: falls back to the pageId itself for a page that was
  // imported with no real Name (e.g. an AutoTrigger page) -- matching
  // buildQuestFromJson's own import-side fallback, though that means an
  // originally Name-less page will re-export WITH a synthetic Name. Known,
  // narrow (AutoTrigger-only) limitation, not fixed here.
  out.Name = page.title || page.pageId;
  var autoTrigger = fieldValue(fields, 'autotrigger');
  if(autoTrigger === 'true') out.AutoTrigger = true;
  var requirements = splitLines(fieldValue(fields, 'requirements') || '');
  if(requirements.length) out.Requirements = requirements;
  var loadActions = splitLines(fieldValue(fields, 'loadactions') || '');
  if(loadActions.length) out.LoadActions = loadActions;
  var dialog = brToNewlines(fieldValue(fields, 'dialog'));
  if(dialog) out.Dialog = dialog;
  var journalText = brToNewlines(fieldValue(fields, 'journaltext'));
  if(journalText) out.JournalText = journalText;
  var requiresResponse = fieldValue(fields, 'requiresresponse');
  if(requiresResponse === 'true') out.RequiresResponse = true;
  var objectives = splitLines(fieldValue(fields, 'objectives') || '');
  if(objectives.length) out.Objectives = objectives;
  var responses = parseResponseField(fieldValue(fields, 'response(s)'));
  if(responses) out.Responses = responses;
  return out;
}

/* Builds the real QuestLines-format quest object for one quest record.
   `questlineName`, if the quest belongs to one, is the questline's own
   display name (QuestlineTitle) -- not stored on the quest record itself. */
export function serializeQuestToJson(quest, questlineName){
  var out = {};
  if(quest.questlineId){
    out.QuestlineId = quest.questlineId;
    if(questlineName) out.QuestlineTitle = questlineName;
  }
  out.Title = quest.name || quest.id;
  if(quest.description) out.Description = quest.description;
  if(quest.repeatable) out.Repeatable = true;
  if(quest.rewards) out.Rewards = quest.rewards;
  if(quest.requirements && quest.requirements.length) out.Requirements = quest.requirements;
  out.Pages = (quest.pages || []).map(function(p){ return p.pageId; });
  var pageData = {};
  (quest.pages || []).forEach(function(p){ pageData[p.pageId] = serializePage(p); });
  out.PageData = pageData;
  return out;
}

/* Real quest files escape a small set of characters as \uXXXX rather than
   emitting them literally (QUEST_GUIDE.md's "Escape special characters"
   rule: curly apostrophes, angle brackets, ampersands) -- JSON.stringify
   doesn't do this on its own, so it's a post-process over the finished
   string. Safe here because none of these four characters can appear as
   JSON structural syntax outside of a string value. */
var ESCAPES = {'’': '\\u2019', '<': '\\u003c', '>': '\\u003e', '&': '\\u0026'};
function escapeSpecialChars(json){
  return json.replace(/[’<>&]/g, function(ch){ return ESCAPES[ch]; });
}

/* The actual file contents to write for one quest -- 2-space indentation
   per QUEST_GUIDE.md's file & folder structure rule. */
export function questToJsonString(quest, questlineName){
  return escapeSpecialChars(JSON.stringify(serializeQuestToJson(quest, questlineName), null, 2));
}
