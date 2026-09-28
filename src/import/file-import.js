import { state, loadStore, saveStore, genId } from '../state/store.js';
import { elFileInput, elFolderInput } from '../dom.js';
import { layoutPages } from './markdown-import.js';
import { buildQuestFromJson, findQuestStateRefs } from './quest-json-import.js';
import { switchToQuest, loadFromMarkdown } from '../state/quest-switch.js';
import { showCanvasView } from '../views.js';
import { persistCurrent, flashStatus } from '../state/persist.js';
import { renderLibrary } from '../library/library-view.js';
import { isStorymapperExport } from './storymapper-export.js';

/* ================= file import ================= */
// A .md import always creates a new standalone quest. A .json import is
// keyed by filename (QuestLines: quest id == filename), so re-importing
// updates that quest in place.

/* Finds or creates the questline named by the JSON's QuestlineId, even on a
   single-file import. */
export function resolveQuestlineForJson(store, qj) {
	if (!qj.QuestlineId) return null;
	if (!store.questlines[qj.QuestlineId]) {
		store.questlines[qj.QuestlineId] = { id: qj.QuestlineId, name: qj.QuestlineTitle || qj.QuestlineId, connections: [] };
	} else if (qj.QuestlineTitle) {
		store.questlines[qj.QuestlineId].name = qj.QuestlineTitle;
	}
	return qj.QuestlineId;
}

/* Imports or re-imports one quest, keyed by filename. On re-import, pages
   are matched by pageId: existing pages keep their x/y, new pages go below
   the rest, and removed pages move to trash. */
export function importOrUpdateQuest(questId, questName, built, questlineId) {
	var store = loadStore();
	var existing = store.quests[questId];
	var pages = built.pages;
	var trash;
	if (existing) {
		var oldByPageId = {};
		(existing.pages || []).forEach(function (p) { oldByPageId[p.pageId] = p; });
		var toLayout = [], maxY = 0;
		pages.forEach(function (p) {
			var old = oldByPageId[p.pageId];
			if (old) { p.x = old.x; p.y = old.y; if (p.y > maxY) maxY = p.y; }
			else { toLayout.push(p); }
		});
		if (toLayout.length) {
			layoutPages(toLayout);
			toLayout.forEach(function (p) { p.y += maxY + 340; });
		}
		var stillPresent = {};
		pages.forEach(function (p) { stillPresent[p.pageId] = true; });
		trash = (existing.trash || []).slice();
		(existing.pages || []).forEach(function (p) {
			if (!stillPresent[p.pageId]) trash.push({ page: p, deletedAt: Date.now() });
		});
	} else {
		// Lay out in flow order; `pages` keeps the source priority order for export.
		layoutPages(built.layoutOrder || pages);
		trash = [];
	}
	store.quests[questId] = {
		id: questId,
		name: questName,
		questlineId: questlineId || null,
		status: existing && existing.status,
		order: existing && existing.questlineId === (questlineId || null) ? existing.order : undefined,
		// Re-import replaces metadata rather than merging it.
		description: built.meta.description,
		repeatable: built.meta.repeatable,
		rewards: built.meta.rewards,
		requirements: built.meta.requirements,
		pages: pages,
		connections: built.connections,
		trash: trash,
		pan: (existing && existing.pan) || { x: 60, y: 40 },
		zoom: (existing && existing.zoom) || 1,
		updatedAt: Date.now()
	};
	store.nextPageId = state.nextPageId;
	store.nextConnId = state.nextConnId;
	// Throw so callers can report the failure (e.g. storage full).
	if (!saveStore(store)) throw new Error('could not save to this browser (storage may be full)');
	return store;
}

document.getElementById('import-quest-btn').addEventListener('click', function () { elFileInput.click(); });
elFileInput.addEventListener('change', function () {
	var file = elFileInput.files[0];
	if (!file) return;
	var isJson = /\.json$/i.test(file.name);
	var reader = new FileReader();
	reader.onload = function () {
		if (isJson) {
			var qj;
			try { qj = JSON.parse(String(reader.result)); }
			catch (e) { flashStatus('Could not parse "' + file.name + '" as JSON', 4000); return; }
			// A full export replaces everything; send the user to the confirming control.
			if (isStorymapperExport(qj)) {
				flashStatus('"' + file.name + '" is a full StoryMapper export — use Options › Import Storymapper JSON… to restore it', 6000);
				return;
			}
			var questId = file.name.replace(/\.json$/i, '');
			var questName = qj.Title || questId;
			var built = buildQuestFromJson(qj);
			var store = loadStore();
			var questlineId = resolveQuestlineForJson(store, qj);
			saveStore(store);
			try {
				importOrUpdateQuest(questId, questName, built, questlineId);
				switchToQuest(questId);
			} catch (saveErr) {
				flashStatus('Could not import "' + file.name + '": ' + saveErr.message, 6000);
			}
		} else {
			var name = file.name.replace(/\.(md|txt)$/i, '');
			loadFromMarkdown(String(reader.result), { questId: genId(), questName: name });
			persistCurrent();
			showCanvasView();
		}
	};
	reader.readAsText(file);
	elFileInput.value = '';
});

/* ---- questline folder import ---- */
// Groups the folder's *.json files by QuestlineId, imports each quest, then
// draws cross-quest arrows from quest-state requirements (questStarted: etc.)
// that reference another quest in the same group.
document.getElementById('import-questline-btn').addEventListener('click', function () { elFolderInput.click(); });
elFolderInput.addEventListener('change', function () {
	var files = Array.prototype.filter.call(elFolderInput.files, function (f) { return /\.json$/i.test(f.name); });
	if (!files.length) { elFolderInput.value = ''; return; }
	var readers = files.map(function (f) {
		return new Promise(function (resolve) {
			var r = new FileReader();
			r.onload = function () {
				var qj = null;
				var parseError = null;
				try { qj = JSON.parse(String(r.result)); } catch (e) { parseError = e.message; }
				resolve({ name: f.name, qj: qj, parseError: parseError });
			};
			// Resolve on read errors too, or Promise.all never settles.
			r.onerror = function () {
				resolve({ name: f.name, qj: null, readError: (r.error && r.error.message) || 'could not be read' });
			};
			r.readAsText(f);
		});
	});
	Promise.all(readers).then(function (results) {
		var groups = {}; // QuestlineId -> [{questId, qj}]
		var skipped = []; // "filename: reason" for anything that never made it into a group
		results.forEach(function (r) {
			if (r.readError) { skipped.push(r.name + ': ' + r.readError); return; }
			if (r.parseError) { skipped.push(r.name + ': not valid JSON (' + r.parseError + ')'); return; }
			if (!r.qj || !r.qj.PageData) { skipped.push(r.name + ': no PageData, not a quest file'); return; }
			if (!r.qj.QuestlineId) { skipped.push(r.name + ': no QuestlineId (import it as a standalone quest instead)'); return; }
			var questId = r.name.replace(/\.json$/i, '');
			(groups[r.qj.QuestlineId] = groups[r.qj.QuestlineId] || []).push({ questId: questId, qj: r.qj });
		});
		var groupIds = Object.keys(groups);
		if (!groupIds.length) {
			flashStatus('No quest .json files with a QuestlineId were found in that folder' + (skipped.length ? (' — ' + skipped.join('; ')) : ''), 6000);
			elFolderInput.value = '';
			return;
		}
		var importedCount = 0;
		groupIds.forEach(function (qlId) {
			var members = groups[qlId];
			var store = loadStore();
			var title = (members.map(function (m) { return m.qj.QuestlineTitle; }).filter(Boolean)[0]) || qlId;
			if (!store.questlines[qlId]) store.questlines[qlId] = { id: qlId, name: title, connections: [] };
			else store.questlines[qlId].name = title;
			if (!saveStore(store)) skipped.push(qlId + ': could not save to this browser (storage may be full)');

			var idByQuestId = {}; // sibling questId -> its Pages[0] internal page id, filled in after each build
			var builtByQuestId = {};
			// Isolate each member so one failure skips only that file.
			members.forEach(function (m) {
				try {
					var built = buildQuestFromJson(m.qj);
					builtByQuestId[m.questId] = built;
					var ok = true;
					try { importOrUpdateQuest(m.questId, m.qj.Title || m.questId, built, qlId); }
					catch (saveErr) { ok = false; skipped.push(m.questId + ': ' + saveErr.message); }
					if (ok) {
						importedCount++;
						var firstJsonPageId = (m.qj.Pages && m.qj.Pages[0]) || Object.keys(m.qj.PageData || {})[0];
						var firstPage = built.pages.filter(function (p) { return p.pageId === firstJsonPageId; })[0];
						if (firstPage) idByQuestId[m.questId] = firstPage.id;
					}
				} catch (buildErr) {
					skipped.push(m.questId + ': ' + buildErr.message);
				}
			});

			// Second pass: cross-quest arrows, now that every member's pages exist.
			var crossConns = [];
			members.forEach(function (m) {
				if (!builtByQuestId[m.questId]) return; // this member failed above, nothing to draw from
				var qj = m.qj;
				Object.keys(qj.PageData || {}).forEach(function (pid) {
					var pd = qj.PageData[pid];
					var built = builtByQuestId[m.questId];
					var fromPage = built.pages.filter(function (p) { return p.pageId === pid; })[0];
					if (!fromPage) return;
					var refs = findQuestStateRefs(pd.Requirements);
					refs.forEach(function (ref) {
						var targetQuestId = members.some(function (mm) { return mm.questId === ref.questId; }) ? ref.questId : null;
						if (!targetQuestId || targetQuestId === m.questId) return; // only sibling quests in this same group
						var toId = idByQuestId[targetQuestId];
						if (!toId) return;
						var exists = crossConns.some(function (c) { return c.from === fromPage.id && c.to === toId; });
						if (exists) return;
						crossConns.push({ id: 'w' + (state.nextConnId++), from: fromPage.id, to: toId, fromSide: 'right', toSide: 'left', _cross: true, label: ref.raw });
					});
				});
			});
			var store2 = loadStore();
			if (store2.questlines[qlId]) store2.questlines[qlId].connections = crossConns;
			store2.nextPageId = state.nextPageId;
			store2.nextConnId = state.nextConnId;
			if (!saveStore(store2)) skipped.push(qlId + ': cross-quest arrows could not be saved (storage may be full)');
		});
		var summary = 'Imported ' + importedCount + ' quest' + (importedCount === 1 ? '' : 's') +
			' across ' + groupIds.length + ' questline' + (groupIds.length === 1 ? '' : 's');
		if (skipped.length) summary += ' — skipped: ' + skipped.join('; ');
		flashStatus(summary, skipped.length ? 8000 : 2200);
		renderLibrary();
		elFolderInput.value = '';
	}).catch(function (err) {
		flashStatus('Questline import failed: ' + err.message, 6000);
		elFolderInput.value = '';
	});
});
