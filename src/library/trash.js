import { state, loadStore, saveStore } from '../state/store.js';
import { elTrashBackdrop, elTrashList, elViewport } from '../dom.js';
import { escapeHtml } from '../utils/text.js';
import { toWorld } from '../canvas/pan-zoom.js';
import { renderAll } from '../render/cards.js';
import { flashStatus } from '../state/persist.js';
import { restoreQuestFromTrash, restoreQuestlineFromTrash, renderLibrary } from './library-view.js';

/* ================= trash panel ================= */

function timeAgo(ms){
  var diff = Math.max(0, Date.now() - ms);
  var mins = Math.round(diff / 60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return mins + 'm ago';
  var hours = Math.round(mins / 60);
  if(hours < 24) return hours + 'h ago';
  var days = Math.round(hours / 24);
  return days + 'd ago';
}

/* Restore is one panel covering all three soft-deletable things — pages,
   quests, and questlines — kept as separate sections rather than a merged
   list since they restore through different code paths and a page's
   trash only ever means "in the quest currently open" while quests and
   questlines are store-wide. Each row carries data-type + data-index so
   the single click handler below can route to the right restore fn. */
export function renderTrashList(){
  var store = loadStore();
  var html = '';

  html += '<div class="trash-section"><h3 class="trash-section-head">Pages</h3>';
  if(!state.questId && !state.activeQuestlineId){
    html += '<div class="trash-empty">Open a quest or questline to see its deleted pages.</div>';
  } else if(!state.trash.length){
    html += '<div class="trash-empty">Nothing deleted in this quest.</div>';
  } else {
    state.trash.forEach(function(entry, i){
      html += '<div class="trash-row" data-type="page" data-index="' + i + '">' +
        '<div class="trash-row-info">' +
          '<div class="trash-row-name">' + escapeHtml(entry.page.title) + '</div>' +
          '<div class="trash-row-meta"><span class="pageid">' + escapeHtml(entry.page.pageId) + '</span> &middot; deleted ' + timeAgo(entry.deletedAt) + '</div>' +
        '</div>' +
        '<div class="trash-row-actions"><button type="button" class="restore">Restore</button></div>' +
      '</div>';
    });
  }
  html += '</div>';

  html += '<div class="trash-section"><h3 class="trash-section-head">Quests</h3>';
  if(!store.trashedQuests.length){
    html += '<div class="trash-empty">Nothing deleted.</div>';
  } else {
    store.trashedQuests.forEach(function(entry, i){
      html += '<div class="trash-row" data-type="quest" data-index="' + i + '">' +
        '<div class="trash-row-info">' +
          '<div class="trash-row-name">' + escapeHtml(entry.quest.name || 'Untitled Quest') + '</div>' +
          '<div class="trash-row-meta">deleted ' + timeAgo(entry.deletedAt) + '</div>' +
        '</div>' +
        '<div class="trash-row-actions"><button type="button" class="restore">Restore</button></div>' +
      '</div>';
    });
  }
  html += '</div>';

  html += '<div class="trash-section"><h3 class="trash-section-head">Questlines</h3>';
  if(!store.trashedQuestlines.length){
    html += '<div class="trash-empty">Nothing deleted.</div>';
  } else {
    store.trashedQuestlines.forEach(function(entry, i){
      html += '<div class="trash-row" data-type="questline" data-index="' + i + '">' +
        '<div class="trash-row-info">' +
          '<div class="trash-row-name">' + escapeHtml(entry.questline.name || 'Untitled Questline') + '</div>' +
          '<div class="trash-row-meta">deleted ' + timeAgo(entry.deletedAt) + '</div>' +
        '</div>' +
        '<div class="trash-row-actions"><button type="button" class="restore">Restore</button></div>' +
      '</div>';
    });
  }
  html += '</div>';

  elTrashList.innerHTML = html;

  var isEmpty = !state.trash.length && !store.trashedQuests.length && !store.trashedQuestlines.length;
  document.getElementById('trash-delete-all').disabled = isEmpty;
}

// Same arm-then-confirm pattern as confirmDangerClick in library-view.js:
// window.confirm() is silently suppressed in this sandboxed context, so
// destructive actions instead arm the button on the first click and only
// act on a second click on that same still-armed button.
var armedDeleteAllBtn = null;
var armedDeleteAllTimer = null;
function resetArmedDeleteAll(){
  if(armedDeleteAllBtn){
    armedDeleteAllBtn.textContent = 'Delete All';
    armedDeleteAllBtn.classList.remove('armed');
  }
  armedDeleteAllBtn = null;
  if(armedDeleteAllTimer){ clearTimeout(armedDeleteAllTimer); armedDeleteAllTimer = null; }
}
function confirmDeleteAllClick(btn){
  if(armedDeleteAllBtn === btn){
    resetArmedDeleteAll();
    return true;
  }
  resetArmedDeleteAll();
  armedDeleteAllBtn = btn;
  btn.textContent = 'Confirm?';
  btn.classList.add('armed');
  armedDeleteAllTimer = setTimeout(resetArmedDeleteAll, 4000);
  return false;
}

function deleteAllTrash(){
  state.trash.length = 0;
  var store = loadStore();
  store.trashedQuests.length = 0;
  store.trashedQuestlines.length = 0;
  saveStore(store);
  renderTrashList();
  if(state.view === 'library') renderLibrary();
  flashStatus('Trash emptied', 2000);
}

export function restorePage(trashIndex){
  var entry = state.trash[trashIndex];
  if(!entry) return;
  var wp = toWorld(elViewport.getBoundingClientRect().left + elViewport.clientWidth/2,
                    elViewport.getBoundingClientRect().top + elViewport.clientHeight/2);
  entry.page.x = wp.x - 150;
  entry.page.y = wp.y - 80;
  state.pages.push(entry.page);
  state.trash.splice(trashIndex, 1);
  renderAll();
  renderTrashList();
}

document.getElementById('trash-btn').addEventListener('click', function(){
  renderTrashList();
  elTrashBackdrop.classList.add('open');
});
document.getElementById('trash-close').addEventListener('click', function(){
  elTrashBackdrop.classList.remove('open');
});
document.getElementById('trash-delete-all').addEventListener('click', function(e){
  if(confirmDeleteAllClick(e.currentTarget)) deleteAllTrash();
});
elTrashBackdrop.addEventListener('mousedown', function(e){
  if(e.target === elTrashBackdrop) elTrashBackdrop.classList.remove('open');
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && elTrashBackdrop.classList.contains('open')) elTrashBackdrop.classList.remove('open');
});
elTrashList.addEventListener('click', function(e){
  var row = e.target.closest('.trash-row');
  if(!row) return;
  if(!e.target.closest('.restore')) return;
  var index = Number(row.dataset.index);
  var type = row.dataset.type;
  if(type === 'page'){
    restorePage(index);
    return;
  }
  if(type === 'quest'){
    restoreQuestFromTrash(index);
    flashStatus('Quest restored', 1800);
  } else if(type === 'questline'){
    restoreQuestlineFromTrash(index);
    flashStatus('Questline restored', 1800);
  }
  // Quest/questline restores touch the store, not the live canvas state —
  // if the library is open behind this panel, refresh it so the restored
  // item shows up without needing to close and reopen Restore.
  if(state.view === 'library') renderLibrary();
  renderTrashList();
});
