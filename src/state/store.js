/* ================= state ================= */
export var state = {
  pages: [],         // Page (a dialog node): {id, x, y, title, pageId, fields:[{key,value}]} — "card" is only its on-canvas UI representation
  connections: [],   // {id, from, to}
  trash: [],         // soft-deleted pages: {page, deletedAt} — restorable, dropped with no connections
  nextPageId: 1,      // global monotonic counter (lives on the store, mirrored here) — never reset on quest switch
  nextConnId: 1,
  pan: {x: 60, y: 40},
  zoom: 1,
  selectedConn: null,
  editingCardId: null,
  // Ephemeral multi-select for a shift-drag "temp group" move — a lasso
  // selection, not a saved grouping like a Questline. Never persisted to
  // the store; cleared on every quest/questline switch.
  selectedCardIds: new Set(),
  view: 'canvas',         // 'canvas' | 'library'
  questId: null,
  questName: 'Untitled Quest',
  questlineId: null,        // a Quest may belong to a QuestLine (a group of quests) or stand alone
  activeQuestlineId: null,  // non-null only when the canvas is showing a WHOLE questline (merged view)
  questlineMembers: []      // [{questId, name}] — member quests of the active whole-questline view, in display order
};

export var PRIMARY_KEYS = ['dialog', 'response(s)', 'responses'];

/* ================= local persistence =================
   Quests are stored keyed by id so this schema already supports more
   than one saved quest, even though the UI to switch between them
   doesn't exist yet (that's a later step) — today only one quest is
   ever active at a time. A quest optionally belongs to a QuestLine
   (a group of related quests); there's no UI for that grouping yet
   either, but the field is there so quests can be tagged into one
   later without another migration. */
export var STORAGE_KEY = 'storymapper:quests:v1';
export var STORAGE_KEY_OLD = 'storymapper:boards:v1';

export function genId(){
  return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function defaultStore(){
  return {version: 2, activeQuestId: null, activeQuestlineId: null, quests: {}, questlines: {}, trashedQuests: [], trashedQuestlines: [], nextPageId: 1, nextConnId: 1, world: {factions: {}, npcs: {}, locations: {}}};
}

/* One-time migration from the pre-rename "boards" schema (cards ->
   pages, boardId -> questId) so anyone who already autosaved under the
   old key doesn't lose it. Global id counters and the questlines map
   are filled in afterward by ensureStoreShape(). */
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

/* Repairs two data-integrity invariants that a bug elsewhere in the app
   (or a hand-edited import) can violate: every quest's object key must
   equal its own `.id` (a mismatch -- most concretely a key of "null" from
   a quest record saved with `.id: null` -- makes it a member of whatever
   questline its stale `.questlineId` happened to hold, rendering as a
   second, uneditable "ghost" section there), and every page id must be
   unique across the WHOLE store, not just within one quest (see the
   nextPageId comment above -- a duplicate page id across two quests in
   the same questline resolves to only one DOM card store-wide, so the
   two quests' pages visually swap/hop on drag instead of moving
   independently). Runs on every load so already-corrupted saved/imported
   data self-heals; nothing is deleted, records just get a valid id. */
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

/* Brings any previously-saved store up to the current schema: adds a
   questlines map if missing, computes safe global nextPageId/nextConnId
   counters by scanning every quest's existing page and connection ids
   (needed because those counters used to live per-quest, which could
   never collide since only one quest was ever shown at a time — now that
   a whole questline can render several quests' pages together, ids must
   be unique across the whole store), and runs repairStoreIdentity(). */
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

export function loadStore(){
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

/* Returns true on success. A quota-exceeded or private-browsing write
   failure here used to be swallowed completely silently — callers that
   care (currently: questline folder import) now get a false back so they
   can tell the user their data didn't actually save, instead of it just
   quietly not being there next time they look. */
export function saveStore(store){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch(e){
    if(window.console && console.error) console.error('StoryMapper: could not save to localStorage', e);
    return false;
  }
}

export function pageById(id){
  return state.pages.filter(function(p){return p.id === id;})[0];
}
