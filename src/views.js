import { state } from './state/store.js';
import {
  elLibraryView, elWorldView, elCanvasArea, elQuestPill,
  elAddCardBtn, elClearCrossBtn, elRelayoutBtn, elValidateQuestBtn, elLinkedItemsToggle,
  elOptionsBtn, elOptionsMenu, elNavLibraryPill, elNavWorldPill
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

/* ================= view switching ================= */

/* "Re-arrange by flow", "Clear cross-quest arrows" and "Restore Pages" live
   together under one "Options" menu so the topbar doesn't grow a button
   per action. The first two still hide themselves per-view exactly as
   before (see updateTopbarForView below) — only their container moved. */
function closeOptionsMenu(){
  elOptionsMenu.hidden = true;
  elOptionsBtn.setAttribute('aria-expanded', 'false');
}
elOptionsBtn.addEventListener('click', function(e){
  e.stopPropagation();
  var willOpen = elOptionsMenu.hidden;
  elOptionsMenu.hidden = !willOpen;
  elOptionsBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
});
// Any item click both runs that item's own handler (attached elsewhere,
// unchanged) and closes the menu afterward.
elOptionsMenu.addEventListener('click', function(e){
  if(e.target.closest('.dropdown-item')) closeOptionsMenu();
});
document.addEventListener('click', function(e){
  if(!elOptionsMenu.hidden && !e.target.closest('#options-dropdown')) closeOptionsMenu();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !elOptionsMenu.hidden) closeOptionsMenu();
});

/* "+ Page" only makes sense when a single quest is open — inside a
   whole-questline view it would be ambiguous which quest a new page
   belongs to, so it's hidden there. (Importing a .md now lives in the
   library, since it always creates a new standalone quest rather than
   acting on whatever's currently open.) */
export function updateTopbarForView(){
  var singleQuest = state.view === 'canvas' && !state.activeQuestlineId;
  var wholeQuestline = state.view === 'canvas' && !!state.activeQuestlineId;
  if(elAddCardBtn) elAddCardBtn.style.display = singleQuest ? '' : 'none';
  if(elRelayoutBtn) elRelayoutBtn.style.display = singleQuest ? '' : 'none';
  if(elValidateQuestBtn) elValidateQuestBtn.style.display = singleQuest ? '' : 'none';
  if(elLinkedItemsToggle) elLinkedItemsToggle.style.display = singleQuest ? '' : 'none';
  if(elClearCrossBtn) elClearCrossBtn.style.display = wholeQuestline ? '' : 'none';
  if(elNavLibraryPill) elNavLibraryPill.classList.toggle('active', state.view === 'library');
  if(elNavWorldPill) elNavWorldPill.classList.toggle('active', state.view === 'world' || state.view === 'world-item');
  // the current-quest subheader only makes sense while something is open
  // on the canvas — it's empty (and hidden via #quest-pill:empty) in the library and the world section
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
  // flush whatever's on the canvas before leaving it, so a rename or
  // edit made moments ago is reflected when the library reloads from storage
  if(state.questId || state.activeQuestlineId){
    cancelAutosave();
    persistCurrent();
  }
  // Nothing is "open" on the canvas while the library is showing. This
  // matters because the library edits the store directly (rename,
  // assign to a questline) without touching `state` — if state.questId
  // stayed set, the next switchToQuest/switchToQuestline would see it,
  // re-persist this now-stale in-memory record, and clobber whatever was
  // just changed from the library (e.g. an assignment made moments ago).
  state.questId = null;
  state.activeQuestlineId = null;
  state.view = 'library';
  elCanvasArea.style.display = 'none';
  if(elWorldView) elWorldView.classList.remove('open');
  elLibraryView.classList.add('open');
  updateTopbarForView();
  renderLibrary();
}

if(elNavLibraryPill) elNavLibraryPill.addEventListener('click', showLibraryView);
if(elNavWorldPill) elNavWorldPill.addEventListener('click', function(){ showWorldView(); });

// Bulk removal for cross-quest arrows: one-by-one deletion (select a wire,
// click its × ) works but a questline can easily auto-draw more of these
// than anyone wants to click through by hand. Only touches connections
// tagged _cross — every member quest's own pages and same-quest arrows are
// untouched, and this only exists to remove in the current whole-questline
// view, so it's a no-op outside one.
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

// Re-import intentionally preserves a page's existing position once it's
// been imported once (that's what keeps hand-arranged layouts from being
// clobbered by a routine re-import) — which means the improved,
// arrow-following layout order only ever applies to genuinely new pages.
// This is the explicit opt-in for applying it to an already-imported
// quest's existing pages too, since a re-import alone won't.
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
