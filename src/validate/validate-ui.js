import { state, loadStore } from '../state/store.js';
import { elValidateQuestBtn, elValidateBackdrop, elValidateSummary, elValidateIssues, elValidateClose } from '../dom.js';
import { escapeHtml } from '../utils/text.js';
import { validateQuest } from './quest-validator.js';

/* ================= validate quest (UI) =================
   Manually triggered only -- never run automatically on save or import,
   since a quest is expected to spend most of its life as prose that
   isn't real QuestLines syntax yet (see quest-validator.js's attribution
   note for what's actually being checked and why). */

function countBadge(level, count){
  return count ? '<span class="validate-count ' + level + '">' + count + ' ' + level + (count === 1 ? '' : 's') + '</span>' : '';
}

function renderReport(report){
  elValidateSummary.innerHTML =
    countBadge('error', report.errorCount()) +
    countBadge('warning', report.warningCount()) +
    countBadge('info', report.infoCount());

  var issues = report.sortedIssues();
  if(!issues.length){
    elValidateIssues.innerHTML = '<div class="validate-clean">No issues found.</div>';
    return;
  }
  elValidateIssues.innerHTML = issues.map(function(issue){
    var level = issue.level.toLowerCase();
    return '<div class="validate-issue">' +
      '<span class="validate-issue-level ' + level + '">' + level + '</span>' +
      '<div class="validate-issue-body">' +
        '<div class="validate-issue-path">' + escapeHtml(issue.path) + '</div>' +
        '<div class="validate-issue-message">' + escapeHtml(issue.message) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

if(elValidateQuestBtn) elValidateQuestBtn.addEventListener('click', function(){
  if(!state.questId) return; // only meaningful for a single open quest, not a merged questline view
  var store = loadStore();
  var stored = store.quests[state.questId] || {};
  var quest = {
    id: state.questId,
    name: state.questName,
    questlineId: state.questlineId,
    description: stored.description,
    repeatable: stored.repeatable,
    rewards: stored.rewards,
    requirements: stored.requirements,
    pages: state.pages, // live, unsaved edits included -- not read back from storage
  };
  var report = validateQuest(quest, store.quests);
  renderReport(report);
  elValidateBackdrop.classList.add('open');
});

if(elValidateClose) elValidateClose.addEventListener('click', function(){
  elValidateBackdrop.classList.remove('open');
});
if(elValidateBackdrop) elValidateBackdrop.addEventListener('mousedown', function(e){
  if(e.target === elValidateBackdrop) elValidateBackdrop.classList.remove('open');
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && elValidateBackdrop && elValidateBackdrop.classList.contains('open')) elValidateBackdrop.classList.remove('open');
});
