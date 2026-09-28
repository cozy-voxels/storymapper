import { splitLines, parseResponses } from '../utils/text.js';

/* ================= JSON quest export (QuestLines mod format) =================
   Inverse of buildQuestFromJson. Leaves out layout, arrows and World
   data; page links come from the Response(s) text instead. */

function fieldValue(fields, key){
  var match = (fields || []).filter(function(f){ return f.key.toLowerCase() === key; })[0];
  return match ? match.value : undefined;
}

/* Inverse of jsonLinesToBr(): '<br>' back to newlines. */
function brToNewlines(raw){
  if(!raw) return undefined;
  return raw.split(/\s*<br\s*\/?>\s*/i).join('\n');
}

/* Parses Response(s) text back into Responses. Hand-written prose sub-lines
   (e.g. "— Starts the_quest quest") are exported as-is and will be
   invalid Actions. */
function parseResponseField(raw){
  if(!raw) return undefined;
  var responses = parseResponses(raw).map(function(r){
    var out = {Text: r.text};
    if(r.requirements.length) out.Requirements = r.requirements;
    if(r.actions.length) out.Actions = r.actions;
    return out;
  });
  return responses.length ? responses : undefined;
}

function serializePage(page){
  var fields = page.fields || [];
  var out = {};
  // Falls back to pageId, so a page imported without a Name (e.g.
  // AutoTrigger) exports with one. Known limitation.
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

/* Builds the QuestLines quest object. `questlineName` becomes
   QuestlineTitle. */
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

/* Escapes ’ < > & as \uXXXX, as QuestLines files do. Safe on the whole
   string since none of these are JSON syntax. */
var ESCAPES = {'’': '\\u2019', '<': '\\u003c', '>': '\\u003e', '&': '\\u0026'};
function escapeSpecialChars(json){
  return json.replace(/[’<>&]/g, function(ch){ return ESCAPES[ch]; });
}

/* File contents for one quest, 2-space indented. */
export function questToJsonString(quest, questlineName){
  return escapeSpecialChars(JSON.stringify(serializeQuestToJson(quest, questlineName), null, 2));
}
