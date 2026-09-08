/* ================= link suggestions =================
   Scans a page's own prose fields for NPC/Location names that aren't
   linked yet and offers them up in the edit modal (see
   src/editor/modal.js's "Suggested links" panel) -- manual-add-only, this
   just surfaces candidates, it never links anything itself. */
import { plainTextForMatching, compareNames } from '../utils/text.js';

var TEXT_FIELD_KEYS = ['dialog', 'journaltext', 'objectives', 'response(s)', 'responses'];

function pageTextBlob(page){
  return (page.fields || [])
    .filter(function(f){ return TEXT_FIELD_KEYS.indexOf(f.key.toLowerCase()) !== -1; })
    .map(function(f){ return plainTextForMatching(f.value); })
    .join(' \n ')
    .toLowerCase();
}

/* linkedIds: {npcs: [...ids already linked], locations: [...]} -- excluded
   from suggestions regardless of whether they're saved on the page yet, so
   a name just added via the picker drops out of the list immediately. */
export function suggestLinks(page, store, linkedIds){
  var blob = pageTextBlob(page);
  if(!blob.trim()) return [];
  linkedIds = linkedIds || {};
  var suggestions = [];
  ['npcs', 'locations'].forEach(function(category){
    var items = (store.world || {})[category] || {};
    var linked = linkedIds[category] || [];
    Object.keys(items).forEach(function(id){
      if(linked.indexOf(id) !== -1) return;
      var name = (items[id].name || '').trim();
      if(!name) return;
      if(blob.indexOf(name.toLowerCase()) !== -1){
        suggestions.push({category: category, id: id, name: name});
      }
    });
  });
  suggestions.sort(function(a, b){ return compareNames(a.name, b.name); });
  return suggestions;
}
