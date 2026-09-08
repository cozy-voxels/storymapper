import { state, loadStore, saveStore, genId } from '../state/store.js';
import { elFileInput, elFolderInput } from '../dom.js';
import { layoutPages } from './markdown-import.js';
import { buildQuestFromJson, findQuestStateRefs } from './quest-json-import.js';
import { switchToQuest, loadFromMarkdown } from '../state/quest-switch.js';
import { showCanvasView } from '../views.js';
import { persistCurrent, flashStatus } from '../state/persist.js';
import { renderLibrary } from '../library/library-view.js';

/* ================= file import ================= */
// Importing a .md draft always creates a brand-new standalone quest, never
// acts on whatever's currently open — so the control lives in the library
// rather than the canvas topbar. Importing a real quest .json is keyed by
// its filename instead (the QuestLines convention: quest id == filename),
// so re-importing the same file updates that quest in place rather than
// piling up duplicates.

/* If the quest JSON declares a QuestlineId, honor it even on a single-file
   import: find or create that questline (using QuestlineTitle for its
   name) so the quest lands where the source data says it belongs, rather
   than always dropping it into Standalone quests. */
export function resolveQuestlineForJson(store, qj){
  if(!qj.QuestlineId) return null;
  if(!store.questlines[qj.QuestlineId]){
    store.questlines[qj.QuestlineId] = {id: qj.QuestlineId, name: qj.QuestlineTitle || qj.QuestlineId, connections: []};
  } else if(qj.QuestlineTitle){
    store.questlines[qj.QuestlineId].name = qj.QuestlineTitle;
  }
  return qj.QuestlineId;
}

/* Imports (or re-imports) one quest into the store, keyed by a stable id
   derived from its filename — per the QuestLines convention, the quest id
   always matches the filename. A re-import matches pages by pageId to
   preserve any manual repositioning: surviving pages keep their x/y,
   brand-new pages get laid out below the rest, and pages no longer present
   in the source are soft-deleted to trash (recoverable), never dropped. */
export function importOrUpdateQuest(questId, questName, built, questlineId){
  var store = loadStore();
  var existing = store.quests[questId];
  var pages = built.pages;
  var trash;
  if(existing){
    var oldByPageId = {};
    (existing.pages || []).forEach(function(p){ oldByPageId[p.pageId] = p; });
    var toLayout = [], maxY = 0;
    pages.forEach(function(p){
      var old = oldByPageId[p.pageId];
      if(old){ p.x = old.x; p.y = old.y; if(p.y > maxY) maxY = p.y; }
      else { toLayout.push(p); }
    });
    if(toLayout.length){
      layoutPages(toLayout);
      toLayout.forEach(function(p){ p.y += maxY + 340; });
    }
    var stillPresent = {};
    pages.forEach(function(p){ stillPresent[p.pageId] = true; });
    trash = (existing.trash || []).slice();
    (existing.pages || []).forEach(function(p){
      if(!stillPresent[p.pageId]) trash.push({page: p, deletedAt: Date.now()});
    });
  } else {
    layoutPages(pages);
    trash = [];
  }
  store.quests[questId] = {
    id: questId,
    name: questName,
    questlineId: questlineId || null,
    status: existing && existing.status,
    pages: pages,
    connections: built.connections,
    trash: trash,
    pan: (existing && existing.pan) || {x: 60, y: 40},
    zoom: (existing && existing.zoom) || 1,
    updatedAt: Date.now()
  };
  store.nextPageId = state.nextPageId;
  store.nextConnId = state.nextConnId;
  // Throw rather than swallow: the questline folder importer wraps each
  // member's import in its own try/catch specifically so one failed save
  // (e.g. storage full) is reported and skipped instead of silently
  // leaving that quest missing with no explanation.
  if(!saveStore(store)) throw new Error('could not save to this browser (storage may be full)');
  return store;
}

document.getElementById('import-quest-btn').addEventListener('click', function(){ elFileInput.click(); });
elFileInput.addEventListener('change', function(){
  var file = elFileInput.files[0];
  if(!file) return;
  var isJson = /\.json$/i.test(file.name);
  var reader = new FileReader();
  reader.onload = function(){
    if(isJson){
      var qj;
      try{ qj = JSON.parse(String(reader.result)); }
      catch(e){ flashStatus('Could not parse "' + file.name + '" as JSON', 4000); return; }
      var questId = file.name.replace(/\.json$/i, '');
      var questName = qj.Title || questId;
      var built = buildQuestFromJson(qj);
      var store = loadStore();
      var questlineId = resolveQuestlineForJson(store, qj);
      saveStore(store);
      try{
        importOrUpdateQuest(questId, questName, built, questlineId);
        switchToQuest(questId);
      } catch(saveErr){
        flashStatus('Could not import "' + file.name + '": ' + saveErr.message, 6000);
      }
    } else {
      var name = file.name.replace(/\.(md|txt)$/i, '');
      loadFromMarkdown(String(reader.result), {questId: genId(), questName: name});
      persistCurrent();
      showCanvasView();
    }
  };
  reader.readAsText(file);
  elFileInput.value = '';
});

/* ---- questline folder import ---- */
// Groups the selected folder's *.json files by their own QuestlineId
// (usually all the same, but handled per-group in case a folder ever
// mixes quests from more than one questline), imports/updates every
// member quest, then auto-draws cross-quest arrows from any
// questStarted:/questCompleted:/questNotStarted:/questNotCompleted:
// requirement that references a sibling quest in the same group.
document.getElementById('import-questline-btn').addEventListener('click', function(){ elFolderInput.click(); });
elFolderInput.addEventListener('change', function(){
  var files = Array.prototype.filter.call(elFolderInput.files, function(f){ return /\.json$/i.test(f.name); });
  if(!files.length){ elFolderInput.value = ''; return; }
  var readers = files.map(function(f){
    return new Promise(function(resolve){
      var r = new FileReader();
      r.onload = function(){
        var qj = null;
        var parseError = null;
        try{ qj = JSON.parse(String(r.result)); } catch(e){ parseError = e.message; }
        resolve({name: f.name, qj: qj, parseError: parseError});
      };
      // Without this, a file the OS can't read (permissions, a transient
      // lock, etc.) leaves its promise forever unresolved, which hangs
      // Promise.all and silently stalls the whole import with no feedback.
      r.onerror = function(){
        resolve({name: f.name, qj: null, readError: (r.error && r.error.message) || 'could not be read'});
      };
      r.readAsText(f);
    });
  });
  Promise.all(readers).then(function(results){
    var groups = {}; // QuestlineId -> [{questId, qj}]
    var skipped = []; // "filename: reason" for anything that never made it into a group
    results.forEach(function(r){
      if(r.readError){ skipped.push(r.name + ': ' + r.readError); return; }
      if(r.parseError){ skipped.push(r.name + ': not valid JSON (' + r.parseError + ')'); return; }
      if(!r.qj || !r.qj.PageData){ skipped.push(r.name + ': no PageData, not a quest file'); return; }
      if(!r.qj.QuestlineId){ skipped.push(r.name + ': no QuestlineId (import it as a standalone quest instead)'); return; }
      var questId = r.name.replace(/\.json$/i, '');
      (groups[r.qj.QuestlineId] = groups[r.qj.QuestlineId] || []).push({questId: questId, qj: r.qj});
    });
    var groupIds = Object.keys(groups);
    if(!groupIds.length){
      flashStatus('No quest .json files with a QuestlineId were found in that folder' + (skipped.length ? (' — ' + skipped.join('; ')) : ''), 6000);
      elFolderInput.value = '';
      return;
    }
    var importedCount = 0;
    groupIds.forEach(function(qlId){
      var members = groups[qlId];
      var store = loadStore();
      var title = (members.map(function(m){ return m.qj.QuestlineTitle; }).filter(Boolean)[0]) || qlId;
      if(!store.questlines[qlId]) store.questlines[qlId] = {id: qlId, name: title, connections: []};
      else store.questlines[qlId].name = title;
      if(!saveStore(store)) skipped.push(qlId + ': could not save to this browser (storage may be full)');

      var idByQuestId = {}; // sibling questId -> its Pages[0] internal page id, filled in after each build
      var builtByQuestId = {};
      // One bad member (an unexpected shape buildQuestFromJson doesn't
      // handle, or a failed save) used to throw out of this forEach and
      // silently abort every quest after it in the same folder — that's
      // almost certainly what happened if some quests in a questline
      // import land and later ones just don't: isolate each member so one
      // failure only skips that one file and everything else still runs.
      members.forEach(function(m){
        try{
          var built = buildQuestFromJson(m.qj);
          builtByQuestId[m.questId] = built;
          var ok = true;
          try{ importOrUpdateQuest(m.questId, m.qj.Title || m.questId, built, qlId); }
          catch(saveErr){ ok = false; skipped.push(m.questId + ': ' + saveErr.message); }
          if(ok){
            importedCount++;
            var firstJsonPageId = (m.qj.Pages && m.qj.Pages[0]) || Object.keys(m.qj.PageData || {})[0];
            var firstPage = built.pages.filter(function(p){ return p.pageId === firstJsonPageId; })[0];
            if(firstPage) idByQuestId[m.questId] = firstPage.id;
          }
        } catch(buildErr){
          skipped.push(m.questId + ': ' + buildErr.message);
        }
      });

      // Second pass: cross-quest arrows, now that every member's pages exist.
      var crossConns = [];
      members.forEach(function(m){
        if(!builtByQuestId[m.questId]) return; // this member failed above, nothing to draw from
        var qj = m.qj;
        Object.keys(qj.PageData || {}).forEach(function(pid){
          var pd = qj.PageData[pid];
          var built = builtByQuestId[m.questId];
          var fromPage = built.pages.filter(function(p){ return p.pageId === pid; })[0];
          if(!fromPage) return;
          var refs = findQuestStateRefs(pd.Requirements);
          refs.forEach(function(ref){
            var targetQuestId = members.some(function(mm){ return mm.questId === ref.questId; }) ? ref.questId : null;
            if(!targetQuestId || targetQuestId === m.questId) return; // only sibling quests in this same group
            var toId = idByQuestId[targetQuestId];
            if(!toId) return;
            var exists = crossConns.some(function(c){ return c.from === fromPage.id && c.to === toId; });
            if(exists) return;
            crossConns.push({id: 'w' + (state.nextConnId++), from: fromPage.id, to: toId, fromSide: 'right', toSide: 'left', _cross: true, label: ref.raw});
          });
        });
      });
      var store2 = loadStore();
      if(store2.questlines[qlId]) store2.questlines[qlId].connections = crossConns;
      store2.nextPageId = state.nextPageId;
      store2.nextConnId = state.nextConnId;
      if(!saveStore(store2)) skipped.push(qlId + ': cross-quest arrows could not be saved (storage may be full)');
    });
    var summary = 'Imported ' + importedCount + ' quest' + (importedCount === 1 ? '' : 's') +
      ' across ' + groupIds.length + ' questline' + (groupIds.length === 1 ? '' : 's');
    if(skipped.length) summary += ' — skipped: ' + skipped.join('; ');
    flashStatus(summary, skipped.length ? 8000 : 2200);
    renderLibrary();
    elFolderInput.value = '';
  }).catch(function(err){
    flashStatus('Questline import failed: ' + err.message, 6000);
    elFolderInput.value = '';
  });
});
