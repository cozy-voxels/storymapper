/* Loads the live canvas `state` from the store and switches between
   quests and questlines. Used by boot, file import, and the library. */
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

/* Sets pan/zoom to frame all pages. Runs on every open, since a saved
   camera position can point at empty space. Card height is estimated,
   so the framing is approximate. */
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
  // Size reads 0 if the viewport is hidden; fall back to a default size.
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
  // Page ids come from the global state.nextPageId counter; never reset it.
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
  // Id counters are global (from the store), not per-quest. Pan/zoom are
  // recomputed rather than restored (see fitViewToPages).
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

/* Moves each member quest's pages as a block so sections don't overlap.
   Pages keep their positions relative to each other. Section boxes are
   drawn later from the DOM by renderSections().

   savedOffsets (questId -> {x, y}) restores where each section was last
   dragged. Members without one are stacked below the previous section. */
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

/* Opens a single quest by id, saving the current canvas first. */
export function switchToQuest(id){
  closeConnLabelChooser();
  if(state.questId || state.activeQuestlineId) persistCurrent();
  var store = loadStore();
  var quest = store.quests[id];
  if(!quest) return;
  state.nextPageId = store.nextPageId;
  state.nextConnId = store.nextConnId;
  // Show the canvas first: fitViewToPages needs the viewport's real size.
  showCanvasView();
  restoreQuest(quest);
  store.activeQuestId = id;
  store.activeQuestlineId = null;
  saveStore(store);
  notifyViewChange();
}

/* Opens a whole questline on one canvas. Member pages and trash are tagged
   with _questId so persistCurrentQuestline() can split them back apart.
   Returns false, leaving state unchanged, if the questline is missing or
   has no member quests. */
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
  // Tag questline-level connections so they render differently and are
  // saved back to the questline record.
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

  // Show the canvas first: fitViewToPages needs the viewport's real size.
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
