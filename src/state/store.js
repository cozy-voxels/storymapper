/* ================= state ================= */
export var state = {
  pages: [],         // {id, x, y, title, pageId, fields:[{key,value}]}; a "card" is its on-canvas element
  connections: [],   // {id, from, to}
  trash: [],         // soft-deleted pages: {page, deletedAt}
  nextPageId: 1,      // global counter, mirrored from the store; never reset
  nextConnId: 1,
  pan: {x: 60, y: 40},
  zoom: 1,
  selectedConn: null,
  editingCardId: null,
  // Lasso selection. Not saved; cleared on quest/questline switch.
  selectedCardIds: new Set(),
  view: 'canvas',         // 'canvas' | 'library'
  questId: null,
  questName: 'Untitled Quest',
  questlineId: null,        // the open quest's questline, or null if standalone
  activeQuestlineId: null,  // set only in the whole-questline view
  questlineMembers: []      // [{questId, name}] in the whole-questline view, in display order
};

export var PRIMARY_KEYS = ['dialog', 'response(s)', 'responses'];

/* ================= local persistence =================
   Quests and questlines are stored by id in one localStorage record. */
export var STORAGE_KEY = 'storymapper:quests:v1';
export var STORAGE_KEY_OLD = 'storymapper:boards:v1';

export function genId(){
  return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function defaultStore(){
  return {version: 2, activeQuestId: null, activeQuestlineId: null, quests: {}, questlines: {}, trashedQuests: [], trashedQuestlines: [], nextPageId: 1, nextConnId: 1, world: {factions: {}, npcs: {}, locations: {}}};
}

/* Migrates the old "boards" schema (cards -> pages, boardId -> questId).
   ensureStoreShape() fills in the rest. */
export function migrateLegacyStore(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY_OLD);
    if(!raw) return null;
    var old = JSON.parse(raw);
    if(!old || typeof old !== 'object' || !old.boards) return null;
    var migrated = {version: 2, activeQuestId: old.activeBoardId || null, activeQuestlineId: null, quests: {}, questlines: {}};
    Object.keys(old.boards).forEach(function(id){
      var b = old.boards[id];
      migrated.quests[id] = {
        id: b.id,
        name: b.name,
        questlineId: null,
        pages: b.cards || [],
        connections: b.connections || [],
        trash: [],
        pan: b.pan,
        zoom: b.zoom,
        updatedAt: b.updatedAt
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(STORAGE_KEY_OLD);
    return migrated;
  } catch(e){
    return null;
  }
}

/* Runs on every load to repair two invariants without deleting anything:
   - each quest's key equals its .id (a "null" key shows up as a ghost
     section in its questline)
   - page ids are unique across the whole store (duplicates share one DOM
     card in a questline view) */
function repairStoreIdentity(store){
  var quests = store.quests || {};
  Object.keys(quests).forEach(function(key){
    var quest = quests[key];
    if(!quest || typeof quest !== 'object') return;
    if(!quest.id || quest.id !== key){
      delete quests[key];
      quest.id = genId();
      quests[quest.id] = quest;
    }
  });
  var seenPageIds = {};
  Object.keys(quests).forEach(function(qid){
    var quest = quests[qid];
    var idMap = {};
    var allPages = (quest.pages || []).concat(
      (quest.trash || []).map(function(t){ return t.page; }).filter(Boolean)
    );
    allPages.forEach(function(p){
      if(!p || !p.id) return;
      if(seenPageIds[p.id]){
        var freshId = 'p' + (store.nextPageId++);
        idMap[p.id] = freshId;
        p.id = freshId;
      }
      seenPageIds[p.id] = true;
    });
    if(Object.keys(idMap).length){
      (quest.connections || []).forEach(function(c){
        if(idMap[c.from]) c.from = idMap[c.from];
        if(idMap[c.to]) c.to = idMap[c.to];
      });
    }
  });
}

/* Upgrades a saved store to the current schema: adds missing maps, sets
   the global id counters above every existing id, and runs
   repairStoreIdentity(). */
export function ensureStoreShape(store){
  if(!store.questlines || typeof store.questlines !== 'object') store.questlines = {};
  if(typeof store.activeQuestlineId === 'undefined') store.activeQuestlineId = null;
  if(!Array.isArray(store.trashedQuests)) store.trashedQuests = [];
  if(!Array.isArray(store.trashedQuestlines)) store.trashedQuestlines = [];
  if(!store.world || typeof store.world !== 'object') store.world = {};
  if(!store.world.factions || typeof store.world.factions !== 'object') store.world.factions = {};
  if(!store.world.npcs || typeof store.world.npcs !== 'object') store.world.npcs = {};
  if(!store.world.locations || typeof store.world.locations !== 'object') store.world.locations = {};
  if(!(typeof store.nextPageId === 'number' && typeof store.nextConnId === 'number')){
    var maxPage = 0, maxConn = 0;
    var trackPage = function(id){
      var n = parseInt(String(id).replace(/^p/, ''), 10);
      if(!isNaN(n) && n > maxPage) maxPage = n;
    };
    var trackConn = function(id){
      var n = parseInt(String(id).replace(/^w/, ''), 10);
      if(!isNaN(n) && n > maxConn) maxConn = n;
    };
    Object.keys(store.quests || {}).forEach(function(qid){
      var q = store.quests[qid];
      (q.pages || []).forEach(function(p){ trackPage(p.id); });
      (q.connections || []).forEach(function(c){ trackConn(c.id); });
      (q.trash || []).forEach(function(t){ if(t.page) trackPage(t.page.id); });
    });
    (store.trashedQuests || []).forEach(function(entry){
      var q = entry.quest;
      if(!q) return;
      (q.pages || []).forEach(function(p){ trackPage(p.id); });
      (q.connections || []).forEach(function(c){ trackConn(c.id); });
      (q.trash || []).forEach(function(t){ if(t.page) trackPage(t.page.id); });
    });
    store.nextPageId = maxPage + 1;
    store.nextConnId = maxConn + 1;
  }
  repairStoreIdentity(store);
  return store;
}

/* The viewer's data.json text, set at boot by setPublishedStore(). When
   set, loadStore() parses it fresh on each call (callers mutate the result)
   and saveStore() is a no-op. */
var publishedRaw = null;

export function setPublishedStore(raw){
  publishedRaw = raw;
}

export function loadStore(){
  if(publishedRaw !== null) return ensureStoreShape(JSON.parse(publishedRaw));
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      var parsed = JSON.parse(raw);
      if(parsed && typeof parsed === 'object' && parsed.quests) return ensureStoreShape(parsed);
    }
    var migrated = migrateLegacyStore();
    return ensureStoreShape(migrated || defaultStore());
  } catch(e){
    return defaultStore();
  }
}

/* Returns false if the write fails (e.g. quota exceeded). */
export function saveStore(store){
  if(publishedRaw !== null) return true;
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch(e){
    if(window.console && console.error) console.error('StoryMapper: could not save to localStorage', e);
    return false;
  }
}

/* Store copy for the public viewer: drops all trash and the open
   quest/questline. */
export function publishableStore(store){
  var copy = JSON.parse(JSON.stringify(store));
  Object.keys(copy.quests || {}).forEach(function(qid){
    copy.quests[qid].trash = [];
  });
  copy.trashedQuests = [];
  copy.trashedQuestlines = [];
  copy.activeQuestId = null;
  copy.activeQuestlineId = null;
  return copy;
}

/* Sorts by each record's `order` (set by "Reorder quests"). Records
   without one go last, in creation order. */
function sortByOrder(ids, records){
  return ids.map(function(id, i){ return {id: id, i: i}; })
    .sort(function(a, b){
      var oa = typeof records[a.id].order === 'number' ? records[a.id].order : Infinity;
      var ob = typeof records[b.id].order === 'number' ? records[b.id].order : Infinity;
      if(oa !== ob) return oa < ob ? -1 : 1;
      return a.i - b.i;
    })
    .map(function(x){ return x.id; });
}

export function orderedQuestlineIds(store){
  return sortByOrder(Object.keys(store.questlines || {}), store.questlines || {});
}

export function orderedQuestlineMemberIds(store, qlId){
  var quests = store.quests || {};
  var memberIds = Object.keys(quests).filter(function(qid){ return quests[qid].questlineId === qlId; });
  return sortByOrder(memberIds, quests);
}

export function pageById(id){
  return state.pages.filter(function(p){return p.id === id;})[0];
}
