import { state, loadStore, saveStore } from './store.js';
import { elQuestPill, elSaveStatus } from '../dom.js';

/* Writes state.pages/connections/trash back into a single quest's
   record in the store. Used both for plain single-quest mode and,
   tagged per source quest, when splitting a merged questline view
   back apart on save. */
export function persistCurrentQuest(){
  var store = loadStore();
  var existingQuest = store.quests[state.questId];
  store.quests[state.questId] = {
    id: state.questId,
    name: state.questName,
    questlineId: state.questlineId,
    status: existingQuest ? existingQuest.status : undefined,
    // Description/Repeatable/Rewards/Requirements (real QuestLines quest
    // metadata, carried through from JSON import -- see buildQuestFromJson)
    // have no canvas/editor UI of their own yet, so a canvas edit's save
    // must preserve whatever was already stored rather than dropping it.
    description: existingQuest && existingQuest.description,
    repeatable: existingQuest && existingQuest.repeatable,
    rewards: existingQuest && existingQuest.rewards,
    requirements: existingQuest && existingQuest.requirements,
    pages: state.pages,
    connections: state.connections,
    trash: state.trash,
    pan: state.pan,
    zoom: state.zoom,
    updatedAt: Date.now()
  };
  store.activeQuestId = state.questId;
  store.activeQuestlineId = null;
  store.nextPageId = state.nextPageId;
  store.nextConnId = state.nextConnId;
  saveStore(store);
  flashSaved();
}

/* Splits the merged canvas state (pages/connections/trash tagged with
   ._questId) back into each member quest's own record, then saves.
   Connections tagged ._cross are questline-level data (span two
   different member quests) and are routed to the questline's own
   record instead of any single quest's. */
export function persistCurrentQuestline(){
  var store = loadStore();
  var crossConns = state.connections.filter(function(c){ return c._cross; }).map(function(c){
    var out = {id: c.id, from: c.from, to: c.to, fromSide: c.fromSide, toSide: c.toSide};
    if(c.label) out.label = c.label;
    return out;
  });
  // Each member quest's OWN record re-anchors its pages near the origin
  // (see below) so opening that quest alone doesn't start off past the
  // visible canvas — which means the block's actual position on the
  // shared questline canvas, e.g. where the user dragged its section box
  // to, has to be captured here separately or it's lost the moment this
  // save normalizes it away. Recorded per member, on the questline itself,
  // and fed back into layoutQuestlineSections() on the next open.
  var sectionPositions = {};
  state.questlineMembers.forEach(function(m){
    var memberPages = state.pages.filter(function(p){ return p._questId === m.questId; });
    if(!memberPages.length) return;
    var minX = Infinity, minY = Infinity;
    memberPages.forEach(function(p){
      if(p.x < minX) minX = p.x;
      if(p.y < minY) minY = p.y;
    });
    sectionPositions[m.questId] = {x: minX, y: minY};
  });
  state.questlineMembers.forEach(function(m){
    var existing = store.quests[m.questId] || {};
    var memberPages = state.pages.filter(function(p){ return p._questId === m.questId; });
    var trash = state.trash.filter(function(t){ return t._questId === m.questId; });
    var pageIds = {};
    memberPages.forEach(function(p){ pageIds[p.id] = true; });
    var connections = state.connections.filter(function(c){ return !c._cross && pageIds[c.from] && pageIds[c.to]; });
    // layoutQuestlineSections() stacks every member's pages one block
    // below the next on the shared whole-questline canvas, so by the time
    // a quest lower in the stack gets here its pages' x/y can be
    // thousands of pixels down. Saving that as-is into this quest's OWN
    // record used to bake the questline-wide offset in permanently — and
    // since opening a single quest always starts the camera at the same
    // fixed default pan, that quest's cards would sit off past the
    // visible canvas: it would *look* empty even though the pages were
    // all still there in storage. Re-anchor a copy near the origin instead
    // (a plain shift, so each quest's own internal layout is unaffected)
    // and leave the live, still-on-screen state.pages objects untouched so
    // this doesn't visibly reposition anything mid-edit.
    var minX = Infinity, minY = Infinity;
    memberPages.forEach(function(p){
      if(p.x < minX) minX = p.x;
      if(p.y < minY) minY = p.y;
    });
    var shiftX = (minX === Infinity ? 40 : minX) - 40;
    var shiftY = (minY === Infinity ? 40 : minY) - 40;
    var pages = memberPages.map(function(p){
      var clone = {};
      for(var key in p){ if(key !== '_questId') clone[key] = p[key]; }
      clone.x = p.x - shiftX;
      clone.y = p.y - shiftY;
      return clone;
    });
    store.quests[m.questId] = {
      id: m.questId,
      name: existing.name || m.name,
      questlineId: state.activeQuestlineId,
      status: existing.status,
      // See persistCurrentQuest -- same preserve-what-was-already-stored
      // reasoning, since this quest's own metadata isn't touched by
      // anything the whole-questline canvas view can edit.
      description: existing.description,
      repeatable: existing.repeatable,
      rewards: existing.rewards,
      requirements: existing.requirements,
      pages: pages,
      connections: connections,
      trash: trash,
      pan: existing.pan,
      zoom: existing.zoom,
      updatedAt: Date.now()
    };
  });
  if(store.questlines[state.activeQuestlineId]){
    store.questlines[state.activeQuestlineId].connections = crossConns;
    store.questlines[state.activeQuestlineId].sectionPositions = sectionPositions;
  }
  store.activeQuestId = null;
  store.activeQuestlineId = state.activeQuestlineId;
  store.nextPageId = state.nextPageId;
  store.nextConnId = state.nextConnId;
  saveStore(store);
  flashSaved();
}

export function persistCurrent(){
  if(state.activeQuestlineId) persistCurrentQuestline();
  else persistCurrentQuest();
}

var autosaveTimer = null;
export function scheduleAutosave(){
  if(!state.questId && !state.activeQuestlineId) return;
  if(autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(function(){
    autosaveTimer = null;
    persistCurrent();
  }, 600);
}

/* Cancels a pending autosave without running it — used when a view switch
   (to the library or to the world section) needs to flush the CURRENT
   state via persistCurrent() itself rather than let a stale scheduled
   autosave fire later. Exists as an exported function rather than a bare
   module-level variable because autosaveTimer, unlike `state`, is plain
   module-local mutable data — other modules can't reassign an imported
   binding directly, only call back into this module to do it. */
export function cancelAutosave(){
  if(autosaveTimer){ clearTimeout(autosaveTimer); autosaveTimer = null; }
}

var flashTimer = null;
export function flashStatus(text, ms){
  if(!elSaveStatus) return;
  elSaveStatus.textContent = text;
  elSaveStatus.classList.add('show');
  if(flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(function(){ elSaveStatus.classList.remove('show'); }, ms || 1600);
}

export function flashSaved(){
  flashStatus('Saved to this browser', 1600);
}

export function updateQuestPill(){
  if(!elQuestPill) return;
  if(state.activeQuestlineId){
    var store = loadStore();
    var ql = store.questlines[state.activeQuestlineId];
    elQuestPill.textContent = (ql ? ql.name : 'Questline') + ' (questline)';
  } else {
    elQuestPill.textContent = state.questName;
  }
}
