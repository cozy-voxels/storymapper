/* Loading/switching the live canvas `state` to and from the store. These
   functions didn't map cleanly onto any single file in the prescribed
   structure (they're used by boot, by file import, and by the library
   alike, and are neither pure markdown/JSON data transforms nor pure
   store CRUD) — see the refactor report for that judgment call. */
import { state, loadStore, saveStore, genId, orderedQuestlineMemberIds } from './store.js';
import { elViewport } from '../dom.js';
import { parseMarkdownTables, tablesToPages, layoutPages } from '../import/markdown-import.js';
import { persistCurrent, updateQuestPill } from './persist.js';
import { applyTransform } from '../canvas/pan-zoom.js';
import { renderAll, CARD_W } from '../render/cards.js';
import { closeConnLabelChooser } from '../render/wires.js';
import { showCanvasView } from '../views.js';
import { refreshLinkedItemsPanelIfOpen } from '../canvas/linked-items-panel.js';
import { notifyViewChange } from './view-events.js';

function sequentialConnections(pages){
  var conns = [];
  for(var i = 0; i < pages.length - 1; i++){
    var a = pages[i], b = pages[i+1];
    var forward = b.x >= a.x;
    conns.push({
      id: 'w' + (state.nextConnId++),
      from: a.id, to: b.id,
      fromSide: forward ? 'right' : 'left',
      toSide: forward ? 'left' : 'right'
    });
  }
  return conns;
}

/* Fits pan/zoom so every page's bounding box is framed in the viewport —
   called every time a quest or questline is opened from the library,
   rather than trusting a remembered or fixed-default pan/zoom. A stored
   position can point at empty space (most concretely: a quest saved back
   from the whole-questline view, whose pages can sit thousands of pixels
   down its stacked layout — see persistCurrentQuestline), and a fixed
   default doesn't help once a quest's layout has grown past one screen.
   Card height is content-dependent and only known post-render, so this
   uses a fixed estimate — approximate framing, not pixel-perfect, is the
   goal here. */
export function fitViewToPages(pages){
  if(!pages || !pages.length){
    state.pan = {x: 60, y: 40};
    state.zoom = 1;
    return;
  }
  var CARD_H_EST = 260;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pages.forEach(function(p){
    if(p.x < minX) minX = p.x;
    if(p.y < minY) minY = p.y;
    if(p.x + CARD_W > maxX) maxX = p.x + CARD_W;
    if(p.y + CARD_H_EST > maxY) maxY = p.y + CARD_H_EST;
  });
  var PAD = 60;
  var contentW = (maxX - minX) + PAD * 2;
  var contentH = (maxY - minY) + PAD * 2;
  // elViewport may still be display:none at this point (switchToQuest and
  // switchToQuestline now show it first, but this stays defensive in case
  // that ever changes) — clientWidth/Height read 0 then, and 0 is falsy,
  // so this quietly falls back to an assumed reasonable window size rather
  // than computing a zoom of Infinity.
  var vw = elViewport.clientWidth || 1000;
  var vh = elViewport.clientHeight || 700;
  var zoom = Math.min(vw / contentW, vh / contentH, 1.25);
  zoom = Math.max(0.15, zoom);
  var centerX = minX + (maxX - minX) / 2;
  var centerY = minY + (maxY - minY) / 2;
  state.zoom = zoom;
  state.pan = {
    x: vw / 2 - centerX * zoom,
    y: vh / 2 - centerY * zoom
  };
}

export function loadFromMarkdown(md, meta){
  var tables = parseMarkdownTables(md);
  var pages = tablesToPages(tables);
  layoutPages(pages);
  // tablesToPages() already assigned each page.id from the global
  // counter (state.nextPageId) — that counter persists across quest
  // switches now, so ids stay unique store-wide; never reset it here.
  state.pages = pages;
  state.connections = sequentialConnections(pages);
  state.trash = (meta && meta.trash) || [];
  state.selectedConn = null;
  state.selectedCardIds.clear();
  state.pan = {x: 60, y: 40};
  state.zoom = 1;
  state.questId = (meta && meta.questId) || genId();
  state.questName = (meta && meta.questName) || 'Untitled Quest';
  state.questlineId = (meta && meta.questlineId) || null;
  state.activeQuestlineId = null;
  state.questlineMembers = [];
  updateQuestPill();
  applyTransform();
  renderAll();
}

export function restoreQuest(quest){
  state.pages = quest.pages || [];
  state.connections = quest.connections || [];
  state.trash = quest.trash || [];
  // nextPageId/nextConnId are NOT read from the quest record — they are a
  // global counter (state.nextPageId/nextConnId) set once at boot/switch
  // time from the store and never reset per-quest, so ids stay unique
  // even when several quests' pages are shown together in a questline view.
  // Pan/zoom are recomputed to frame the actual pages every time, rather
  // than trusting the quest's remembered camera position (see
  // fitViewToPages — a remembered position can point at empty space).
  fitViewToPages(state.pages);
  state.questId = quest.id;
  state.questName = quest.name || 'Untitled Quest';
  state.questlineId = quest.questlineId || null;
  state.activeQuestlineId = null;
  state.questlineMembers = [];
  state.selectedConn = null;
  state.selectedCardIds.clear();
  updateQuestPill();
  applyTransform();
  renderAll();
  refreshLinkedItemsPanelIfOpen();
}

/* Lays out a whole questline's member quests as separate blocks. Section
   box geometry itself is NOT computed here — it's derived from the live
   DOM in renderSections() so it always tightly wraps the actual
   (dynamically sized) cards. */
/* Stacks each member quest's pages into its own block on the shared
   questline canvas — WITHOUT touching their layout relative to each
   other. This used to call layoutPages() on every member unconditionally,
   which regenerated a fresh grid from scratch every single time the
   questline view opened, silently discarding any hand-arranged layout the
   pages already had (from a prior edit, or even just from import). Now it
   only ever translates each quest's existing block as a whole — layout
   itself is decided once, at import or by hand, and preserved from then
   on; this function's only job is keeping quests from overlapping.

   savedOffsets (questId -> {x, y}) is where a section was last dragged
   to, restored via persistCurrentQuestline()/switchToQuestline() below —
   without it, every reopen of a questline used to fall back to this
   function's own default vertical stack, silently discarding any manual
   rearrangement. A member with no saved offset yet (brand new to the
   questline, or from data saved before this existed) still gets that
   default stacked position, placed below the lowest point reached so far
   so it doesn't land on top of an already-positioned section. */
function layoutQuestlineSections(members, savedOffsets){
  savedOffsets = savedOffsets || {};
  var y = 40;
  var PAD = 50, LABEL_H = 40, CARD_H_EST = 260, SECTION_GAP = 110;
  members.forEach(function(m){
    var pages = state.pages.filter(function(p){ return p._questId === m.questId; });
    if(!pages.length) return;
    var minX = Infinity, minY = Infinity, maxY = -Infinity;
    pages.forEach(function(p){
      if(p.x < minX) minX = p.x;
      if(p.y < minY) minY = p.y;
      if(p.y > maxY) maxY = p.y;
    });
    var saved = savedOffsets[m.questId];
    var targetX = saved ? saved.x : PAD;
    var targetY = saved ? saved.y : (y + LABEL_H);
    var shiftX = targetX - minX;
    var shiftY = targetY - minY;
    pages.forEach(function(p){
      p.x += shiftX;
      p.y += shiftY;
    });
    if(!saved) y = (y + LABEL_H) + (maxY - minY) + CARD_H_EST + SECTION_GAP;
  });
}

/* Opens a single quest by id (unchanged single-quest behavior). Flushes
   whatever is currently on the canvas first so a rename made just before
   switching isn't lost. */
export function switchToQuest(id){
  closeConnLabelChooser();
  if(state.questId || state.activeQuestlineId) persistCurrent();
  var store = loadStore();
  var quest = store.quests[id];
  if(!quest) return;
  state.nextPageId = store.nextPageId;
  state.nextConnId = store.nextConnId;
  // Show the canvas before restoring, not after — restoreQuest's
  // fitViewToPages needs the viewport's real on-screen size, which reads
  // as 0 while it's still display:none.
  showCanvasView();
  restoreQuest(quest);
  store.activeQuestId = id;
  store.activeQuestlineId = null;
  saveStore(store);
  notifyViewChange();
}

/* Opens an entire questline: merges every member quest's pages,
   connections, and trash into one canvas, tagging each entry with its
   source quest (_questId) so it can be split back apart on save, and
   lays out each quest's pages as a distinct block for section rendering. */
/* Returns true on success. Can fail if the questline was deleted from
   under it, or (e.g. after reassigning its only quest elsewhere) it no
   longer has any member quests — callers must handle a false return
   rather than assume the canvas switched, since leaving state untouched
   is safer than showing a blank canvas for a questline with nothing in it. */
export function switchToQuestline(qlId){
  closeConnLabelChooser();
  if(state.questId || state.activeQuestlineId) persistCurrent();
  var store = loadStore();
  var ql = store.questlines[qlId];
  if(!ql) return false;
  var memberIds = orderedQuestlineMemberIds(store, qlId);
  if(!memberIds.length) return false;
  state.nextPageId = store.nextPageId;
  state.nextConnId = store.nextConnId;

  var pages = [], connections = [], trash = [], members = [];
  memberIds.forEach(function(qid){
    var q = store.quests[qid];
    members.push({questId: qid, name: q.name || 'Untitled Quest'});
    (q.pages || []).forEach(function(p){ p._questId = qid; pages.push(p); });
    (q.connections || []).forEach(function(c){ connections.push(c); });
    (q.trash || []).forEach(function(t){ t._questId = qid; trash.push(t); });
  });
  // Cross-quest connections are questline-level data, kept separate from
  // any single quest's own connections — tag them so rendering can style
  // them distinctly and persistCurrentQuestline() knows to route them back
  // to the questline record (not any one member quest) on save.
  (ql.connections || []).forEach(function(c){ c._cross = true; connections.push(c); });

  state.pages = pages;
  state.connections = connections;
  state.trash = trash;
  state.questlineMembers = members;
  state.selectedConn = null;
  state.selectedCardIds.clear();
  state.questId = null;
  state.questName = null;
  state.questlineId = null;
  state.activeQuestlineId = qlId;

  // Show the canvas before framing it — fitViewToPages needs the
  // viewport's real on-screen size, which reads as 0 while it's still
  // display:none (same reasoning as switchToQuest).
  showCanvasView();
  layoutQuestlineSections(members, ql.sectionPositions);
  fitViewToPages(pages);

  updateQuestPill();
  applyTransform();
  renderAll();
  refreshLinkedItemsPanelIfOpen();

  store.activeQuestId = null;
  store.activeQuestlineId = qlId;
  saveStore(store);
  notifyViewChange();
  return true;
}
