import { loadStore } from '../state/store.js';
import { elExportAllBtn } from '../dom.js';
import { persistCurrent } from '../state/persist.js';
import { questToJsonString } from './quest-json-export.js';

/* ================= export actions =================
   The three export needs, each a different shape:
   1. Export all data -- a raw dump of everything StoryMapper knows
      (every quest, questline, trash, World data), with none of the real
      QuestLines schema/validity requirements #2 and #3 have. A backup/
      debugging artifact, not something QuestLines or quests-and-npcs
      ever reads.
   2. Export one quest -- a real QuestLines quest .json (quest-json-export.js
      is the actual schema work); excludes World data and canvas layout/
      arrows, neither of which the real schema has room for.
   3. Export a whole questline -- every member quest as its own real
      QuestLines file, written into a directory named after the
      questline, per QUEST_GUIDE.md's file & folder structure rule. */

function downloadTextFile(filename, text){
  var blob = new Blob([text], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportAllData(){
  persistCurrent(); // flush any pending edit so the dump isn't stale
  var store = loadStore();
  var stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile('storymapper-export-' + stamp + '.json', JSON.stringify(store, null, 2));
}

export function exportQuest(questId){
  var store = loadStore();
  var quest = store.quests[questId];
  if(!quest) return;
  var questlineName = quest.questlineId && store.questlines[quest.questlineId] && store.questlines[quest.questlineId].name;
  downloadTextFile(questId + '.json', questToJsonString(quest, questlineName));
}

/* Uses the File System Access API (Chrome/Edge) so every member quest can
   be written after a single folder-picker grant instead of one
   save-dialog per file. Returns {ok, message} rather than throwing --
   callers show `message` via flashStatus when present (a user-cancelled
   picker comes back with no message, since that's not an error worth
   surfacing). */
export async function exportQuestline(qlId){
  var store = loadStore();
  var ql = store.questlines[qlId];
  if(!ql) return {ok: false, message: 'Questline not found'};
  var memberIds = Object.keys(store.quests).filter(function(qid){ return store.quests[qid].questlineId === qlId; });
  if(!memberIds.length) return {ok: false, message: 'This questline has no quests to export'};
  if(!window.showDirectoryPicker){
    return {ok: false, message: 'This browser can’t write folders directly (needs Chrome or Edge) — use "Export" on each quest instead'};
  }
  var parentHandle;
  try{
    parentHandle = await window.showDirectoryPicker({id: 'storymapper-questline-export', mode: 'readwrite'});
  } catch(e){
    if(e && e.name === 'AbortError') return {ok: false, message: null};
    return {ok: false, message: 'Could not access that folder: ' + e.message};
  }
  var qlDirHandle = await parentHandle.getDirectoryHandle(qlId, {create: true});
  var written = 0;
  for(var i = 0; i < memberIds.length; i++){
    var quest = store.quests[memberIds[i]];
    var fileHandle = await qlDirHandle.getFileHandle(quest.id + '.json', {create: true});
    var writable = await fileHandle.createWritable();
    await writable.write(questToJsonString(quest, ql.name));
    await writable.close();
    written++;
  }
  return {ok: true, message: 'Exported ' + written + ' quest' + (written === 1 ? '' : 's') + ' to "' + qlId + '/"'};
}

if(elExportAllBtn) elExportAllBtn.addEventListener('click', exportAllData);
