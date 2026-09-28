/* ================= quest validation (QuestLines mod format) =================

   A JavaScript port of QuestLines Core's `/ql validate` command, rebuilt
   from decompiled questlines-core-1.15.1.jar
   (net.evilcraft.questlines.validator.*) so quests can be checked offline.

   All credit for the validation rules belongs to the QuestLines Core mod
   and its author, RedStoner. This adapts that logic to StoryMapper's data
   model; it is not a copy of the (unpublished) source.

   Differences from the mod:
   - Only quest/page/response checks are ported (PageLogicValidator and its
     Requirement/Action/TrackingTag sub-validators). NPC, achievement,
     event and wave-arena validators are out of scope.
   - It validates the JSON that Export would write, so prose action lines
     in unfinished quests warn as unrecognised.
   - Text fields are plain strings here, not per-locale maps, so locale
     checks become a single non-empty check.
   - There's no registry of custom types, so unrecognised types always warn. */

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

/* Port of PageLogicValidator.findExternallyDrivenQuests/scanForQuestIds,
   simplified to token-match this quest's id against each other quest's
   combined text. Answers "does anything else reference this quest?" */
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

/* Validates one StoryMapper quest record. `allQuests` (store.quests) is
   only used to tell a state-holder quest that others reference from an
   orphaned one. Returns a ValidationReport. */
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
