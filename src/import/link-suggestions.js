/* ================= link suggestions =================
   Finds unlinked NPC/Location names in a page's title and fields for the
   edit modal's "Suggested links" panel. Suggestions are never auto-linked. */
import { plainTextForMatching, compareNames } from '../utils/text.js';

function pageTextBlob(page){
  var parts = (page.fields || []).map(function(f){ return plainTextForMatching(f.value); });
  if(page.title) parts.unshift(plainTextForMatching(page.title));
  return parts.join(' \n ').toLowerCase();
}

function escapeRegExp(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Word-boundary match, so "Max" doesn't match inside "Maximilian". */
function nameAppearsInBlob(name, blob){
  var re = new RegExp('\\b' + escapeRegExp(name.toLowerCase()) + '\\b');
  return re.test(blob);
}

/* linkedIds: {npcs: [...], locations: [...]}, the modal's current links,
   excluded from suggestions. */
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
      if(nameAppearsInBlob(name, blob)){
        suggestions.push({category: category, id: id, name: name});
      }
    });
  });
  suggestions.sort(function(a, b){ return compareNames(a.name, b.name); });
  return suggestions;
}
