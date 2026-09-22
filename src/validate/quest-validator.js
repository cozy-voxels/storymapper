/* ================= quest validation (QuestLines mod format) =================

   This is a JavaScript port of the validation logic behind QuestLines
   Core's in-game `/ql validate` admin command, decompiled from
   questlines-core-1.15.1.jar (net.evilcraft.questlines.validator.*) and
   manually translated so a quest can be checked here, offline, before
   ever touching a live server.

   All credit for the actual validation rules -- every requirement/action
   syntax check, every warning heuristic -- belongs to the QuestLines
   Core mod and its author, RedStoner. Nothing here is an original design;
   it is a repurposing of that mod's own logic for use inside StoryMapper,
   adapted to this app's data model (see below), not a copy of its source
   (the mod's source is not published; this was rebuilt from decompiled
   bytecode).

   Deliberate differences from the live mod:
   - The mod's NpcConfigValidator/AchievementValidator/EventConfigValidator/
     WaveArenaValidator (NPC registry, achievements, events, wave arenas)
     are out of scope -- StoryMapper doesn't model any of that data, only
     quests. Only the quest/page/response logic (PageLogicValidator and
     its RequirementValidator/ActionValidator/TrackingTagValidator
     sub-checks) is ported.
   - The mod validates its already-loaded, already-typed Quest/Page/
     Response objects. This validates the same JSON shape this app's own
     exporter (quest-json-export.js) produces -- i.e. it checks exactly
     what "Export" would actually write, which is also why an unfinished,
     hand-authored quest's prose action lines show up as "unrecognised
     action" warnings: that prose isn't real QuestLines syntax yet, same
     as if it had been typed directly into a real quest file.
   - Dialog/Name/Description/etc. are LocalizedText (per-locale maps) in
     the mod; this app only ever stores a single plain string per field,
     so the per-locale format/coverage checks (locale key format,
     "supported locale" list, "prefix differs across locales") don't
     apply and are simplified to a single required/non-empty check.
   - There is no server-side type registry here for custom requirements/
     actions from other plugins, so (unlike the live mod) an unrecognised
     type always produces a warning rather than possibly being silently
     accepted as a known custom type. */

import { ValidationReport } from './validation-report.js';
import { validateRequirement, validateRequirementList } from './requirement-validator.js';
import { validateAction, validateActionList } from './action-validator.js';
import { serializeQuestToJson } from '../export/quest-json-export.js';
import { slugify } from '../utils/text.js';

function requiredText(value, path, label, report){
  if(!value || !String(value).trim()) report.warning(path, '`' + label + '` is empty.');
}

function anyStartsWith(values, prefixLc){
  return !!values && values.some(function(v){ return v && v.toLowerCase().indexOf(prefixLc) === 0; });
}

/* Ported from PageLogicValidator.findExternallyDrivenQuests/scanForQuestIds,
   simplified to scan each OTHER quest's whole text content for a bare
   token matching this quest's id, rather than field-by-field -- the
   token-matching itself (split on anything that isn't part of an id) is
   unchanged, just applied to one combined blob per quest instead of each
   field separately. Good enough to answer the one question it's used
   for here: "does anything else in the project reference this quest?" */
function isExternallyDriven(questId, allQuests){
  if(!allQuests) return false;
  var ids = allQuests;
  return Object.keys(ids).some(function(otherId){
    if(otherId === questId) return false;
    var other = ids[otherId];
    var blob = [
      (other.requirements || []).join(' '),
    ].concat((other.pages || []).map(function(p){
      return (p.fields || []).map(function(f){ return f.value; }).join(' ');
    })).join(' ');
    var tokens = blob.split(/[^A-Za-z0-9_.-]+/);
    return tokens.indexOf(questId) !== -1;
  });
}

function validatePage(questId, pageId, page, questPageIds, report){
  var prefix = 'quest[' + questId + '].PageData.' + pageId;
  var responses = page.Responses || [];
  var visibleCount = responses.filter(function(r){ return r && r.Text; }).length;
  var pageIsShown = !page.AutoTrigger && visibleCount > 0;

  if(pageIsShown){
    requiredText(page.Name, prefix + '.Name', 'Name', report);
    requiredText(page.Dialog, prefix + '.Dialog', 'Dialog', report);
  }

  (page.Objectives || []).forEach(function(text, i){
    var objPath = prefix + '.Objectives[' + i + ']';
    validateRequirement(text, objPath, report);
  });

  validateRequirementList(page.Requirements, prefix + '.Requirements', report);
  validateActionList(page.LoadActions, prefix + '.LoadActions', report);

  if(page.AutoTrigger && !(page.Requirements && page.Requirements.length)){
    report.warning(prefix + '.AutoTrigger', 'AutoTrigger page has no requirements -- it will fire every HUD tick for every player with no gate. Add at least one requirement (e.g. `notTag:flag`, `questNotStarted:id`, `cooldown:key:N`) to control when it triggers.');
  }
  if(visibleCount === 0 && !page.AutoTrigger){
    report.warning(prefix + '.Responses', 'No visible responses -- players will have no way to dismiss or advance.');
  }

  var pageIdSet = {};
  questPageIds.forEach(function(id){ pageIdSet[id] = true; });

  responses.forEach(function(resp, i){
    var rPath = prefix + '.Responses[' + i + ']';
    if(!resp.Text) report.info(rPath, '`Text` is empty -- this response will be hidden.');
    validateRequirementList(resp.Requirements, rPath + '.Requirements', report);
    validateActionList(resp.Actions, rPath + '.Actions', report);

    (resp.Actions || []).forEach(function(a, ai){
      if(!a || a.toLowerCase().indexOf('page:') !== 0) return;
      var target = a.slice(5);
      var sep = target.indexOf(':');
      if(sep !== -1) target = target.slice(0, sep);
      if(!target || pageIdSet[target]) return;
      report.error(rPath + '.Actions[' + ai + ']', '`page:' + target + '` does not match any page in this quest\'s Pages[].');
    });

    var combinedReqs = (page.Requirements || []).concat(resp.Requirements || []);
    var hasTake = anyStartsWith(resp.Actions, 'economy:take');
    var hasAfford = anyStartsWith(combinedReqs, 'economy:canafford');
    if(hasTake && !hasAfford){
      report.warning(rPath, '`economy:take` is present but no `economy:canafford` requirement guards this response. Players with insufficient balance will fail silently.');
    }
    var hasComplete = anyStartsWith(resp.Actions, 'questcompleted:');
    var hasUntrack = anyStartsWith(resp.Actions, 'untrack:') || anyStartsWith(resp.Actions, 'removetag:tracking:');
    var hasTracking = anyStartsWith(combinedReqs, 'kill:') || anyStartsWith(combinedReqs, 'break:') || anyStartsWith(combinedReqs, 'place:') || anyStartsWith(combinedReqs, 'track:');
    if(hasComplete && hasTracking && !hasUntrack){
      report.warning(rPath, 'Quest is completed but tracking counters are not cleaned up. Add `untrack:id` (named trackers) or `removeTag:tracking:...` (legacy) to prevent counters accumulating indefinitely.');
    }
  });

  var summary = {hasTimedActive: false, hasTimedExpired: false};
  (page.Requirements || []).forEach(function(r){
    if(!r) return;
    var rl = r.toLowerCase();
    if(rl.indexOf('timedactive:') === 0) summary.hasTimedActive = true;
    if(rl.indexOf('timedexpired:') === 0) summary.hasTimedExpired = true;
  });
  return summary;
}

/* Validates one quest, in isolation, against the same rules `/ql validate`
   applies to its Pages/PageData -- see the attribution note above.
   `quest` is a StoryMapper quest record (state/store.js shape); `allQuests`
   is the full `store.quests` map, used only to tell a legitimate
   state-holder quest (referenced by another quest's Requirements/Actions)
   apart from a genuinely orphaned one. Returns a ValidationReport. */
export function validateQuest(quest, allQuests){
  var report = new ValidationReport();
  var qlJson = serializeQuestToJson(quest);
  var questId = quest.id;
  var questSlug = slugify(quest.name);
  var prefix = 'quest[' + questSlug + ']';

  requiredText(qlJson.Title, prefix + '.Title', 'Title', report);
  validateRequirementList(qlJson.Requirements, prefix + '.Requirements', report);

  var pageIds = qlJson.Pages || [];
  if(pageIds.length){
    var seen = {};
    pageIds.forEach(function(pid){
      if(seen[pid]) report.warning(prefix + '.Pages', 'Duplicate page ID `' + pid + '` in Pages array.');
      seen[pid] = true;
    });
    Object.keys(seen).forEach(function(pid){
      if(!qlJson.PageData[pid]) report.error(prefix + '.Pages', 'Page `' + pid + '` is listed in Pages but has no entry in PageData.');
    });

    var summaries = Object.keys(seen).map(function(pid){
      var page = qlJson.PageData[pid];
      return page ? validatePage(questSlug, pid, page, pageIds, report) : null;
    }).filter(Boolean);
    var anyTimedActive = summaries.some(function(s){ return s.hasTimedActive; });
    var anyTimedExpired = summaries.some(function(s){ return s.hasTimedExpired; });
    if(anyTimedActive && !anyTimedExpired){
      report.warning(prefix, '`timedActive:` is used but no `timedExpired:` page was found. Players will be stuck if the timer runs out with no failure/expiry page.');
    }
    if(anyTimedExpired && !anyTimedActive){
      report.info(prefix, '`timedExpired:` is used but no `timedActive:` page was found. This is unusual -- is the in-progress page missing?');
    }
  } else if(isExternallyDriven(questId, allQuests)){
    report.info(prefix + '.Pages', 'Quest has no pages of its own. That is fine here -- another quest\'s logic references it, so this is a state holder driven by `startquest:` / `completequest:` and gated with `questStarted:`. Give it pages only if players should be able to talk to it directly.');
  } else {
    report.error(prefix + '.Pages', 'Quest has no pages and nothing references it -- it will never be evaluated or started.');
  }

  return report;
}
