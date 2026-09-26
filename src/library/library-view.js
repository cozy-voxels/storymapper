import { loadStore, saveStore, genId } from '../state/store.js';
import { elQuestlineGroups, elStandaloneQuests } from '../dom.js';
import { escapeHtml } from '../utils/text.js';
import { flashStatus } from '../state/persist.js';
import { switchToQuest, switchToQuestline } from '../state/quest-switch.js';
import { exportQuest, exportQuestline } from '../export/export-actions.js';
import { READ_ONLY } from '../mode.js';

/* ================= library view ================= */

function questlineOptionsHtml(store, selectedId){
  var html = '<option value="">— Standalone —</option>';
  Object.keys(store.questlines).forEach(function(qlId){
    html += '<option value="' + qlId + '"' + (qlId === selectedId ? ' selected' : '') + '>' +
      escapeHtml(store.questlines[qlId].name) + '</option>';
  });
  return html;
}

var QUEST_STATUSES = ['WIP', 'QA', 'Released'];
function questStatusOptionsHtml(selected){
  var html = '<option value=""' + (selected ? '' : ' selected') + '>— Status —</option>';
  QUEST_STATUSES.forEach(function(s){
    html += '<option value="' + s + '"' + (s === selected ? ' selected' : '') + '>' + s + '</option>';
  });
  return html;
}

function rowMenuHtml(items){
  return '<div class="dropdown row-menu">' +
      '<button class="btn icon-btn" type="button" data-role="menu-toggle" aria-haspopup="true" aria-expanded="false" title="More actions">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' +
      '</button>' +
      '<div class="dropdown-menu" data-role="menu" hidden>' + items + '</div>' +
    '</div>';
}

/* The read-only viewer's version of a quest row: no rename, status as a
   static badge, and only Open plus a direct Export (no ⋮ menu, since
   everything else in it -- move, duplicate, delete -- is an edit). */
function readOnlyQuestRowHtml(quest){
  return '<div class="quest-row" data-quest-id="' + quest.id + '">' +
      '<span class="quest-name">' + escapeHtml(quest.name || 'Untitled Quest') + '</span>' +
      (quest.status ? '<span class="quest-status quest-status-badge" data-status="' + escapeHtml(quest.status) + '">' + escapeHtml(quest.status) + '</span>' : '') +
      '<button class="btn" type="button" data-role="open-quest">Open</button>' +
      '<button class="btn" type="button" data-role="export-quest" title="Download as a QuestLines quest .json file">Export</button>' +
    '</div>';
}

function questRowHtml(store, quest){
  if(READ_ONLY) return readOnlyQuestRowHtml(quest);
  var menu = '<label class="dropdown-item dropdown-item-select">Move to questline' +
      '<select data-role="assign" title="Assign to questline">' + questlineOptionsHtml(store, quest.questlineId) + '</select>' +
    '</label>' +
    '<button type="button" class="dropdown-item" data-role="export-quest" title="Download as a real QuestLines quest .json file">Export</button>' +
    '<button type="button" class="dropdown-item" data-role="duplicate-quest" title="Duplicate quest">Duplicate</button>' +
    '<button type="button" class="dropdown-item dropdown-item-danger" data-role="delete-quest" title="Delete quest">Delete</button>';
  return '<div class="quest-row" data-quest-id="' + quest.id + '">' +
      '<span class="quest-name" data-role="name" tabindex="0" title="Click to rename">' + escapeHtml(quest.name || 'Untitled Quest') + '</span>' +
      '<select class="quest-status" data-role="status" data-status="' + escapeHtml(quest.status || '') + '" title="Status">' + questStatusOptionsHtml(quest.status) + '</select>' +
      '<button class="btn" type="button" data-role="open-quest">Open</button>' +
      rowMenuHtml(menu) +
    '</div>';
}

/* Soft delete for a whole quest, mirroring removePage's page-level soft
   delete: the quest's full record (its pages, connections, and own page
   trash) moves out of store.quests and into store.trashedQuests rather
   than being discarded, so it's always recoverable from the Restore
   panel. Its questlineId is left untouched on the stored record — if
   that questline still exists at restore time, the quest quietly resumes
   membership; if not, it comes back standalone (see restoreQuestFromTrash). */
function trashQuest(questId){
  var store = loadStore();
  var quest = store.quests[questId];
  if(!quest) return;
  delete store.quests[questId];
  store.trashedQuests.push({quest: quest, deletedAt: Date.now()});
  if(store.activeQuestId === questId) store.activeQuestId = null;
  saveStore(store);
}

/* Exact copy of a quest -- same pages/content/layout/linked items and
   same connections/arrows, staying in the same questline (if any) --
   named "{name} Copy" so there's no naming prompt to get in the way.
   Pages and connections get freshly-minted ids off the same global
   counters everything else uses (see nextPageId/nextConnId in store.js),
   with a from/to id remap so the copied connections still point at the
   copied pages instead of the originals. */
function duplicateQuest(questId){
  var store = loadStore();
  var quest = store.quests[questId];
  if(!quest) return;
  var idMap = {};
  function clonePage(p){
    var freshId = 'p' + (store.nextPageId++);
    idMap[p.id] = freshId;
    return Object.assign({}, p, {
      id: freshId,
      fields: (p.fields || []).map(function(f){ return Object.assign({}, f); }),
      linkedNpcIds: (p.linkedNpcIds || []).slice(),
      linkedLocationIds: (p.linkedLocationIds || []).slice()
    });
  }
  var pages = (quest.pages || []).map(clonePage);
  var trash = (quest.trash || []).map(function(t){
    return {page: t.page ? clonePage(t.page) : null, deletedAt: t.deletedAt};
  });
  var connections = (quest.connections || []).map(function(c){
    return Object.assign({}, c, {
      id: 'w' + (store.nextConnId++),
      from: idMap[c.from] || c.from,
      to: idMap[c.to] || c.to
    });
  });
  var newId = genId();
  store.quests[newId] = {
    id: newId,
    name: (quest.name || 'Untitled Quest') + ' Copy',
    questlineId: quest.questlineId || null,
    status: quest.status,
    description: quest.description,
    repeatable: quest.repeatable,
    rewards: quest.rewards,
    requirements: quest.requirements,
    pages: pages,
    connections: connections,
    trash: trash,
    pan: quest.pan ? Object.assign({}, quest.pan) : {x: 60, y: 40},
    zoom: quest.zoom,
    updatedAt: Date.now()
  };
  saveStore(store);
  return newId;
}

export function restoreQuestFromTrash(index){
  var store = loadStore();
  var entry = store.trashedQuests[index];
  if(!entry) return;
  var quest = entry.quest;
  if(quest.questlineId && !store.questlines[quest.questlineId]) quest.questlineId = null;
  store.quests[quest.id] = quest;
  store.trashedQuests.splice(index, 1);
  saveStore(store);
}

/* Soft delete for a questline. Unlike a quest, a questline is just a
   grouping shell — deleting it removes that shell but leaves its member
   quests intact, reassigning them to Standalone (same as manually
   clearing each one's questline dropdown) rather than dragging them into
   the trash too. Restoring the questline brings back the empty shell;
   any quests that were in it stay standalone unless reassigned by hand. */
function trashQuestline(qlId){
  var store = loadStore();
  var ql = store.questlines[qlId];
  if(!ql) return;
  Object.keys(store.quests).forEach(function(qid){
    if(store.quests[qid].questlineId === qlId) store.quests[qid].questlineId = null;
  });
  delete store.questlines[qlId];
  store.trashedQuestlines.push({questline: ql, deletedAt: Date.now()});
  if(store.activeQuestlineId === qlId) store.activeQuestlineId = null;
  saveStore(store);
}

export function restoreQuestlineFromTrash(index){
  var store = loadStore();
  var entry = store.trashedQuestlines[index];
  if(!entry) return;
  store.questlines[entry.questline.id] = entry.questline;
  store.trashedQuestlines.splice(index, 1);
  saveStore(store);
}

export function renderLibrary(){
  var store = loadStore();
  var questIds = Object.keys(store.quests);

  var questlineIds = Object.keys(store.questlines);
  if(!questlineIds.length){
    elQuestlineGroups.innerHTML = READ_ONLY
      ? '<div class="library-empty">No questlines.</div>'
      : '<div class="library-empty">No questlines yet. Create one, then assign quests to it below.</div>';
  } else {
    var qlHtml = '';
    questlineIds.forEach(function(qlId){
      var ql = store.questlines[qlId];
      var members = questIds.filter(function(qid){ return store.quests[qid].questlineId === qlId; })
        .map(function(qid){ return store.quests[qid]; });
      var qlMenu = '<button type="button" class="dropdown-item" data-role="export-questline"' + (members.length ? '' : ' disabled') + ' title="Export every quest in this questline as real QuestLines .json files, into a folder named after the questline">Export questline</button>' +
        '<button type="button" class="dropdown-item dropdown-item-danger" data-role="delete-questline" title="Delete questline (its quests become standalone, not deleted)">Delete questline</button>';
      qlHtml += '<div class="questline-block' + (ql.collapsed ? ' collapsed' : '') + '" data-questline-id="' + qlId + '">' +
        '<div class="questline-head" data-role="head">' +
          '<span class="chev">&#9662;</span>' +
          (READ_ONLY
            ? '<span class="questline-name">' + escapeHtml(ql.name || 'Untitled Questline') + '</span>'
            : '<span class="questline-name" data-role="name" tabindex="0" title="Click to rename">' + escapeHtml(ql.name || 'Untitled Questline') + '</span>') +
          '<button class="btn primary" type="button" data-role="open-questline"' + (members.length ? '' : (READ_ONLY ? ' disabled' : ' disabled title="Add a quest to this questline first"')) + '>Open questline</button>' +
          (READ_ONLY ? '' : rowMenuHtml(qlMenu)) +
        '</div>' +
        '<div class="quest-list">' +
          (members.length ? members.map(function(q){ return questRowHtml(store, q); }).join('') : '<div class="library-empty">' + (READ_ONLY ? 'No quests.' : 'No quests assigned yet.') + '</div>') +
        '</div>' +
      '</div>';
    });
    elQuestlineGroups.innerHTML = qlHtml;
  }

  var standalone = questIds.filter(function(qid){ return !store.quests[qid].questlineId; }).map(function(qid){ return store.quests[qid]; });
  elStandaloneQuests.innerHTML = standalone.length
    ? standalone.map(function(q){ return questRowHtml(store, q); }).join('')
    : '<div class="library-empty">No standalone quests.</div>';
}

function startInlineRename(labelEl, onSave){
  var current = labelEl.textContent;
  var input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  labelEl.replaceWith(input);
  input.focus();
  input.select();
  var done = false;
  function commit(){
    if(done) return;
    done = true;
    var next = input.value.trim() || current;
    onSave(next);
    renderLibrary();
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); commit(); }
    else if(e.key === 'Escape'){ done = true; renderLibrary(); }
  });
}

// The create buttons below don't exist in the read-only viewer.
var elNewQuestlineBtn = document.getElementById('new-questline-btn');
if(elNewQuestlineBtn) elNewQuestlineBtn.addEventListener('click', function(){
  var store = loadStore();
  var id = genId();
  store.questlines[id] = {id: id, name: 'New Questline'};
  saveStore(store);
  renderLibrary();
});

// Unlike a new questline (just a grouping shell, nothing to look at until
// quests are added to it), a brand-new quest is immediately useful to
// start filling in -- so this opens straight onto its canvas, same as
// finishing a file import, rather than leaving it sitting in the library.
var elNewQuestBtn = document.getElementById('new-quest-btn');
if(elNewQuestBtn) elNewQuestBtn.addEventListener('click', function(){
  var store = loadStore();
  var id = genId();
  store.quests[id] = {
    id: id,
    name: 'New Quest',
    questlineId: null,
    status: undefined,
    pages: [],
    connections: [],
    trash: [],
    pan: {x: 60, y: 40},
    zoom: 1,
    updatedAt: Date.now()
  };
  saveStore(store);
  switchToQuest(id);
});

// Row/questline-head "⋮" menus: only one open at a time, closed by an
// outside click, Escape, or (in the per-view click handlers below) after
// a menu item completes its action -- mirroring the topbar "Options" menu
// pattern in src/views.js.
function closeAllRowMenus(except){
  document.querySelectorAll('.row-menu > [data-role="menu"]:not([hidden])').forEach(function(menu){
    if(menu === except) return;
    menu.hidden = true;
    menu.closest('.row-menu').querySelector('[data-role="menu-toggle"]').setAttribute('aria-expanded', 'false');
  });
}
document.addEventListener('click', function(e){
  if(!e.target.closest('.row-menu')) closeAllRowMenus();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeAllRowMenus();
});
function handleRowMenuToggle(e){
  var toggle = e.target.closest('[data-role="menu-toggle"]');
  if(!toggle) return false;
  var menu = toggle.closest('.row-menu').querySelector('[data-role="menu"]');
  var willOpen = menu.hidden;
  closeAllRowMenus(willOpen ? menu : null);
  menu.hidden = !willOpen;
  toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  return true;
}

elQuestlineGroups.addEventListener('click', function(e){
  if(handleRowMenuToggle(e)) return;
  var nameEl = !READ_ONLY && e.target.closest('.questline-name');
  if(nameEl){
    // Capture the questline id up front, before startInlineRename swaps
    // nameEl out of the DOM for an <input> — once detached, nameEl has no
    // parent chain left, so looking it up via nameEl.closest(...) inside
    // the onSave callback (which runs later, after the swap) throws.
    var qlIdForRename = nameEl.closest('.questline-block').dataset.questlineId;
    startInlineRename(nameEl, function(next){
      var store = loadStore();
      if(store.questlines[qlIdForRename]){ store.questlines[qlIdForRename].name = next; saveStore(store); }
    });
    return;
  }
  var openQuestline = e.target.closest('[data-role="open-questline"]');
  if(openQuestline){
    var qlBlock = openQuestline.closest('.questline-block');
    switchToQuestline(qlBlock.dataset.questlineId);
    return;
  }
  var exportQuestlineBtn = e.target.closest('[data-role="export-questline"]');
  if(exportQuestlineBtn){
    var qlIdForExport = exportQuestlineBtn.closest('.questline-block').dataset.questlineId;
    closeAllRowMenus();
    exportQuestlineBtn.disabled = true;
    exportQuestline(qlIdForExport).then(function(result){
      exportQuestlineBtn.disabled = false;
      if(result.message) flashStatus(result.message, result.ok ? 2500 : 6000);
    });
    return;
  }
  var deleteQuestline = e.target.closest('[data-role="delete-questline"]');
  if(deleteQuestline){
    var qlId3 = deleteQuestline.closest('.questline-block').dataset.questlineId;
    if(confirmDangerClick(deleteQuestline)){
      trashQuestline(qlId3);
      flashStatus('Questline moved to trash', 2000);
      renderLibrary();
    }
    return;
  }
  var head = e.target.closest('.questline-head');
  if(head && !e.target.closest('button')){
    var block = head.closest('.questline-block');
    var isCollapsed = block.classList.toggle('collapsed');
    var store2 = loadStore();
    var qlId2 = block.dataset.questlineId;
    if(store2.questlines[qlId2]){
      store2.questlines[qlId2].collapsed = isCollapsed;
      saveStore(store2);
    }
    return;
  }
  handleQuestRowClick(e);
});

elStandaloneQuests.addEventListener('click', function(e){
  if(handleRowMenuToggle(e)) return;
  handleQuestRowClick(e);
});

// A sandboxed artifact page can't rely on window.confirm() (it's silently
// suppressed rather than shown), so any destructive action in the library
// (deleting a quest or a questline) uses the same arm-then-confirm pattern
// as the world item delete button below: the first click just puts that
// one button into a "Confirm?" state for a few seconds, and only a second
// click on the SAME still-armed button actually does it.
var armedDeleteBtn = null;
var armedDeleteTimer = null;
function resetArmedDelete(){
  if(armedDeleteBtn){
    armedDeleteBtn.textContent = armedDeleteBtn.dataset.origLabel || '×';
    armedDeleteBtn.classList.remove('armed');
  }
  armedDeleteBtn = null;
  if(armedDeleteTimer){ clearTimeout(armedDeleteTimer); armedDeleteTimer = null; }
}
// Returns true when this click is the confirming second click (caller
// should perform the delete); false when it just armed the button.
function confirmDangerClick(btn){
  if(armedDeleteBtn === btn){
    resetArmedDelete();
    return true;
  }
  resetArmedDelete();
  armedDeleteBtn = btn;
  btn.dataset.origLabel = btn.textContent;
  btn.textContent = 'Confirm?';
  btn.classList.add('armed');
  armedDeleteTimer = setTimeout(resetArmedDelete, 4000);
  return false;
}

function handleQuestRowClick(e){
  var nameEl = !READ_ONLY && e.target.closest('.quest-name');
  var row = e.target.closest('.quest-row');
  if(!row) return;
  var questId = row.dataset.questId;
  var deleteBtn = e.target.closest('[data-role="delete-quest"]');
  if(deleteBtn){
    if(confirmDangerClick(deleteBtn)){
      trashQuest(questId);
      flashStatus('Quest moved to trash', 2000);
      renderLibrary();
    }
    return;
  }
  if(nameEl){
    startInlineRename(nameEl, function(next){
      var store = loadStore();
      if(store.quests[questId]){ store.quests[questId].name = next; saveStore(store); }
    });
    return;
  }
  if(e.target.closest('[data-role="open-quest"]')){
    switchToQuest(questId);
    return;
  }
  if(e.target.closest('[data-role="export-quest"]')){
    closeAllRowMenus();
    exportQuest(questId);
    return;
  }
  if(e.target.closest('[data-role="duplicate-quest"]')){
    duplicateQuest(questId);
    flashStatus('Quest duplicated', 2000);
    renderLibrary();
  }
}

function handleAssignChange(e){
  var select = e.target.closest('[data-role="assign"]');
  if(!select) return;
  var row = select.closest('.quest-row');
  var questId = row.dataset.questId;
  var store = loadStore();
  if(!store.quests[questId]) return;
  store.quests[questId].questlineId = select.value || null;
  saveStore(store);
  renderLibrary();
}
elQuestlineGroups.addEventListener('change', handleAssignChange);
elStandaloneQuests.addEventListener('change', handleAssignChange);

function handleStatusChange(e){
  var select = e.target.closest('[data-role="status"]');
  if(!select) return;
  var row = select.closest('.quest-row');
  var questId = row.dataset.questId;
  var store = loadStore();
  if(!store.quests[questId]) return;
  store.quests[questId].status = select.value || null;
  saveStore(store);
  renderLibrary();
}
elQuestlineGroups.addEventListener('change', handleStatusChange);
elStandaloneQuests.addEventListener('change', handleStatusChange);
