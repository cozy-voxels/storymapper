import { loadStore, state, publishableStore, orderedQuestlineMemberIds } from '../state/store.js';
import { elExportAllBtn } from '../dom.js';
import { persistCurrent } from '../state/persist.js';
import { questToJsonString } from './quest-json-export.js';
import { slugify } from '../utils/text.js';

/* ================= export actions =================
   1. Export all data: raw store dump, for backup.
   2. Export quest: one QuestLines quest .json (no World data or layout).
   3. Export questline: each member quest as a QuestLines file in a folder
      named after the questline. */

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
  // Only save if something is open; otherwise state is stale and would be
  // saved as store.quests["null"].
  if(state.questId || state.activeQuestlineId) persistCurrent();
  var store = loadStore();
  var stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile('storymapper-export-' + stamp + '.json', JSON.stringify(store, null, 2));
}

/* Saves publishableStore() as data.json for the read-only viewer. */
export function exportPublishData(){
  if(state.questId || state.activeQuestlineId) persistCurrent();
  downloadTextFile('data.json', JSON.stringify(publishableStore(loadStore()), null, 2));
}

export function exportQuest(questId){
  var store = loadStore();
  var quest = store.quests[questId];
  if(!quest) return;
  var questlineName = quest.questlineId && store.questlines[quest.questlineId] && store.questlines[quest.questlineId].name;
  downloadTextFile(slugify(quest.name) + '.json', questToJsonString(quest, questlineName));
}

/* Writes all member quests via one folder picker (File System Access API,
   Chrome/Edge). Returns {ok, message}; message is empty if the user
   cancelled. */
export async function exportQuestline(qlId){
  var store = loadStore();
  var ql = store.questlines[qlId];
  if(!ql) return {ok: false, message: 'Questline not found'};
  var memberIds = orderedQuestlineMemberIds(store, qlId);
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
  var qlSlug = slugify(ql.name);
  var qlDirHandle = await parentHandle.getDirectoryHandle(qlSlug, {create: true});
  var written = 0;
  var usedSlugs = {};
  for(var i = 0; i < memberIds.length; i++){
    var quest = store.quests[memberIds[i]];
    var slug = slugify(quest.name);
    if(usedSlugs[slug]){
      usedSlugs[slug]++;
      slug += '_' + usedSlugs[slug];
    } else {
      usedSlugs[slug] = 1;
    }
    var fileHandle = await qlDirHandle.getFileHandle(slug + '.json', {create: true});
    var writable = await fileHandle.createWritable();
    await writable.write(questToJsonString(quest, ql.name));
    await writable.close();
    written++;
  }
  return {ok: true, message: 'Exported ' + written + ' quest' + (written === 1 ? '' : 's') + ' to "' + qlSlug + '/"'};
}

if(elExportAllBtn) elExportAllBtn.addEventListener('click', exportAllData);
var elExportPublishBtn = document.getElementById('export-publish-btn');
if(elExportPublishBtn) elExportPublishBtn.addEventListener('click', exportPublishData);
