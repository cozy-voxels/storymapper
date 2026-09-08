/* ================= story <-> world links =================
   A quest page can carry linkedNpcIds/linkedLocationIds (see
   src/ui/entity-picker.js), added directly on the page objects in
   quest.pages[]. These two helpers read that data back out from the two
   directions the app needs it: which quests reference a given World item
   (for that item's own page), and which World items a given set of pages
   references in total (for the Story-side canvas panel). Nothing here is
   persisted redundantly -- both are computed fresh from the store every
   time, so the two sides can never drift out of sync. */
import { compareNames } from '../utils/text.js';

var LINKED_ID_FIELD = {npcs: 'linkedNpcIds', locations: 'linkedLocationIds'};

/* Trashed quests already live in store.trashedQuests instead of
   store.quests (see library-view.js's trash-move), so iterating
   store.quests here already excludes them without any extra filtering. */
export function questsLinkingToWorldItem(store, category, itemId){
  var field = LINKED_ID_FIELD[category];
  if(!field) return [];
  var quests = store.quests || {};
  var results = Object.keys(quests).filter(function(qid){
    return (quests[qid].pages || []).some(function(p){
      return (p[field] || []).indexOf(itemId) !== -1;
    });
  }).map(function(qid){ return {id: qid, quest: quests[qid]}; });
  results.sort(function(a, b){ return compareNames(a.quest.name, b.quest.name); });
  return results;
}

/* The full set of NPCs/Locations linked from any of the given pages
   (typically state.pages for the quest currently open on the canvas),
   deduped across pages -- the same NPC tagged on five pages in one quest
   still shows up once. Dangling ids (pointing at a since-deleted World
   item) are left in the page data untouched but simply have nothing to
   render here. */
export function linkedWorldItemsForPages(pages, store){
  var ids = {npcs: [], locations: []};
  (pages || []).forEach(function(p){
    ['npcs', 'locations'].forEach(function(category){
      (p[LINKED_ID_FIELD[category]] || []).forEach(function(id){
        if(ids[category].indexOf(id) === -1) ids[category].push(id);
      });
    });
  });
  function toEntries(category){
    var items = (store.world || {})[category] || {};
    return ids[category]
      .filter(function(id){ return items[id]; })
      .map(function(id){ return {id: id, item: items[id]}; })
      .sort(function(a, b){ return compareNames(a.item.name, b.item.name); });
  }
  return {npcs: toEntries('npcs'), locations: toEntries('locations')};
}
