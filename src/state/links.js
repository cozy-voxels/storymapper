/* ================= story <-> world links =================
   Pages store linkedNpcIds/linkedLocationIds. These helpers look the links
   up in both directions, computed fresh from the store each time. */
import { compareNames } from '../utils/text.js';

var LINKED_ID_FIELD = {npcs: 'linkedNpcIds', locations: 'linkedLocationIds'};

/* Trashed quests aren't in store.quests, so they're excluded. */
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

/* Deduped NPCs/Locations linked from the given pages. Ids of deleted
   World items are skipped. */
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
