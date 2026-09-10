/* ================= link suggestions =================
   Scans everything on a page -- title and every field, prose or not --
   for NPC/Location names that aren't linked yet and offers them up in the
   edit modal (see src/editor/modal.js's "Suggested links" panel) --
   manual-add-only, this just surfaces candidates, it never links anything
   itself. Previously this only looked at a hand-picked whitelist of
   "prose" field keys (Dialog/JournalText/Objectives/Response(s)), which
   meant a name styled with QL color/bold tags in Requirements, LoadActions,
   the page title, or a freeform field was silently invisible -- exactly
   the case of a quest's Requirements/Objectives text calling out an NPC's
   full display name, e.g. "{#ca9d6e}{b}Maximilian Boom the Arena
   Showman{/}{/}". There's nothing about any field that makes a name
   mentioned in it a worse suggestion, so now everything is scanned. */
import { plainTextForMatching, compareNames } from '../utils/text.js';

function pageTextBlob(page){
  var parts = (page.fields || []).map(function(f){ return plainTextForMatching(f.value); });
  if(page.title) parts.unshift(plainTextForMatching(page.title));
  return parts.join(' \n ').toLowerCase();
}

function escapeRegExp(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Word-boundary match rather than a bare substring check, so an NPC named
   "Max" doesn't get suggested off the middle of "Maximilian Boom", while a
   full name like "Maximilian Boom" still matches inside the longer styled
   text "Maximilian Boom the Arena Showman". */
function nameAppearsInBlob(name, blob){
  var re = new RegExp('\\b' + escapeRegExp(name.toLowerCase()) + '\\b');
  return re.test(blob);
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
      if(nameAppearsInBlob(name, blob)){
        suggestions.push({category: category, id: id, name: name});
      }
    });
  });
  suggestions.sort(function(a, b){ return compareNames(a.name, b.name); });
  return suggestions;
}
