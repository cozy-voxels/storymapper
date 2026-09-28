import { ensureStoreShape, saveStore } from '../state/store.js';
import { elImportStoreBtn, elStoreFileInput } from '../dom.js';
import { cancelAutosave, flashStatus } from '../state/persist.js';
import { isStorymapperExport } from './storymapper-export.js';

/* ================= full-store import =================
   Restores an "Export all data" file (see exportAllData) by replacing
   EVERYTHING in this browser's store with it -- a backup restore, not a
   merge, so its page/connection ids, layouts and cross-quest arrows come
   back exactly as exported. After saving, the page reloads so boot()
   re-seeds the id counters and in-memory state from the restored store
   rather than this module hand-resetting every piece of `state`. */
export function replaceStoreFromExport(obj){
  cancelAutosave();
  var store = ensureStoreShape(obj);
  if(!saveStore(store)){
    flashStatus('Could not restore: could not save to this browser (storage may be full)', 6000);
    return false;
  }
  location.reload();
  return true;
}

// window.confirm() is silently suppressed in this sandboxed context, so
// this uses the same arm-then-confirm pattern as confirmDangerClick in
// library-view.js: the first click only arms the menu item (and keeps the
// Options menu open by stopping the click before its close-on-item-click
// handler), and only a second click on the still-armed item opens the
// file picker.
var armedTimer = null;
function resetArmed(){
  if(!elImportStoreBtn) return;
  if(elImportStoreBtn.dataset.origLabel) elImportStoreBtn.textContent = elImportStoreBtn.dataset.origLabel;
  elImportStoreBtn.classList.remove('armed');
  if(armedTimer){ clearTimeout(armedTimer); armedTimer = null; }
}

if(elImportStoreBtn && elStoreFileInput){
  elImportStoreBtn.addEventListener('click', function(e){
    if(elImportStoreBtn.classList.contains('armed')){
      resetArmed();
      elStoreFileInput.click();
      return;
    }
    e.stopPropagation();
    elImportStoreBtn.dataset.origLabel = elImportStoreBtn.textContent;
    elImportStoreBtn.textContent = 'Replace ALL data? Click again';
    elImportStoreBtn.classList.add('armed');
    armedTimer = setTimeout(resetArmed, 4000);
  });

  elStoreFileInput.addEventListener('change', function(){
    var file = elStoreFileInput.files[0];
    elStoreFileInput.value = '';
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      var obj;
      try{ obj = JSON.parse(String(reader.result)); }
      catch(e){ flashStatus('Could not parse "' + file.name + '" as JSON', 4000); return; }
      if(!isStorymapperExport(obj)){
        flashStatus('"' + file.name + '" is not a StoryMapper export (use Import quest… or Import questline… for QuestLines files)', 6000);
        return;
      }
      replaceStoreFromExport(obj);
    };
    reader.onerror = function(){
      flashStatus('Could not read "' + file.name + '"', 4000);
    };
    reader.readAsText(file);
  });
}
