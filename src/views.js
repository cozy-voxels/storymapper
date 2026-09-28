import { state } from './state/store.js';
import {
  elLibraryView, elWorldView, elCanvasArea, elQuestPill,
  elAddCardBtn, elClearCrossBtn, elRelayoutBtn, elValidateQuestBtn, elLinkedItemsToggle,
  elOptionsBtn, elOptionsMenu, elNavLibraryPill, elNavWorldPill, elReorderQuestsBtn
} from './dom.js';
import { cancelAutosave, persistCurrent, persistCurrentQuest, persistCurrentQuestline, flashStatus } from './state/persist.js';
import { renderLibrary } from './library/library-view.js';
import { showWorldView } from './world/world-view.js';
import { closeConnLabelChooser, renderWires } from './render/wires.js';
import { orderPagesByFlow } from './import/quest-json-import.js';
import { layoutPages } from './import/markdown-import.js';
import { fitViewToPages } from './state/quest-switch.js';
import { applyTransform } from './canvas/pan-zoom.js';
import { renderAll } from './render/cards.js';
import { notifyViewChange } from './state/view-events.js';

/* ================= view switching ================= */

/* Topbar "Options" menu. Some items hide per view (see updateTopbarForView). */
function closeOptionsMenu(){
  elOptionsMenu.hidden = true;
  elOptionsBtn.setAttribute('aria-expanded', 'false');
}
// The read-only viewer has no Options menu at all.
if(elOptionsBtn && elOptionsMenu){
  elOptionsBtn.addEventListener('click', function(e){
    e.stopPropagation();
    var willOpen = elOptionsMenu.hidden;
    elOptionsMenu.hidden = !willOpen;
    elOptionsBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  // Close the menu after any item's own handler runs.
  elOptionsMenu.addEventListener('click', function(e){
    if(e.target.closest('.dropdown-item')) closeOptionsMenu();
  });
  document.addEventListener('click', function(e){
    if(!elOptionsMenu.hidden && !e.target.closest('#options-dropdown')) closeOptionsMenu();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && !elOptionsMenu.hidden) closeOptionsMenu();
  });
}

/* "+ Page" is hidden in the whole-questline view, where the target quest
   would be ambiguous. */
export function updateTopbarForView(){
  var singleQuest = state.view === 'canvas' && !state.activeQuestlineId;
  var wholeQuestline = state.view === 'canvas' && !!state.activeQuestlineId;
  if(elAddCardBtn) elAddCardBtn.style.display = singleQuest ? '' : 'none';
  if(elRelayoutBtn) elRelayoutBtn.style.display = singleQuest ? '' : 'none';
  if(elValidateQuestBtn) elValidateQuestBtn.style.display = singleQuest ? '' : 'none';
  if(elLinkedItemsToggle) elLinkedItemsToggle.style.display = (singleQuest || wholeQuestline) ? '' : 'none';
  if(elClearCrossBtn) elClearCrossBtn.style.display = wholeQuestline ? '' : 'none';
  if(elReorderQuestsBtn) elReorderQuestsBtn.style.display = state.view === 'library' ? '' : 'none';
  if(elNavLibraryPill) elNavLibraryPill.classList.toggle('active', state.view === 'library');
  if(elNavWorldPill) elNavWorldPill.classList.toggle('active', state.view === 'world' || state.view === 'world-item');
  // quest pill is empty (and hidden via :empty) outside the canvas
  if(elQuestPill) elQuestPill.style.display = (state.view === 'library' || state.view === 'world' || state.view === 'world-item') ? 'none' : '';
}

export function showCanvasView(){
  state.view = 'canvas';
  elLibraryView.classList.remove('open');
  if(elWorldView) elWorldView.classList.remove('open');
  elCanvasArea.style.display = '';
  updateTopbarForView();
}

export function showLibraryView(){
  closeConnLabelChooser();
  // save the canvas before the library reloads from storage
  if(state.questId || state.activeQuestlineId){
    cancelAutosave();
    persistCurrent();
  }
  // Clear the open quest: the library edits the store directly, and a
  // leftover state.questId would make the next switch overwrite those
  // edits with stale state.
  state.questId = null;
  state.activeQuestlineId = null;
  state.view = 'library';
  elCanvasArea.style.display = 'none';
  if(elWorldView) elWorldView.classList.remove('open');
  elLibraryView.classList.add('open');
  updateTopbarForView();
  renderLibrary();
  notifyViewChange();
}

if(elNavLibraryPill) elNavLibraryPill.addEventListener('click', showLibraryView);
if(elNavWorldPill) elNavWorldPill.addEventListener('click', function(){ showWorldView(); });

// Removes all _cross connections in the open questline view. No-op
// outside one.
if(elClearCrossBtn) elClearCrossBtn.addEventListener('click', function(){
  if(!state.activeQuestlineId) return;
  var before = state.connections.length;
  state.connections = state.connections.filter(function(c){ return !c._cross; });
  if(state.connections.length === before) return;
  state.selectedConn = null;
  closeConnLabelChooser();
  renderWires();
  persistCurrentQuestline();
  flashStatus('Cleared cross-quest arrows', 1800);
});

// Re-import keeps existing page positions, so flow layout only applies to
// new pages. This re-lays out all pages of the open quest.
if(elRelayoutBtn) elRelayoutBtn.addEventListener('click', function(){
  if(!state.questId) return;
  var ordered = orderPagesByFlow(state.pages, state.connections);
  layoutPages(ordered);
  fitViewToPages(state.pages);
  applyTransform();
  renderAll();
  persistCurrentQuest();
  flashStatus('Re-arranged by dialogue flow', 1800);
});
