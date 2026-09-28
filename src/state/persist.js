import { state, loadStore, saveStore } from './store.js';
import { elQuestPill, elSaveStatus } from '../dom.js';
import { READ_ONLY } from '../mode.js';

/* Saves state.pages/connections/trash into the open quest's store record. */
export function persistCurrentQuest() {
	if (READ_ONLY) return;
	var store = loadStore();
	var existingQuest = store.quests[state.questId];
	store.quests[state.questId] = {
		id: state.questId,
		name: state.questName,
		questlineId: state.questlineId,
		status: existingQuest ? existingQuest.status : undefined,
		order: existingQuest ? existingQuest.order : undefined,
		description: existingQuest && existingQuest.description,
		repeatable: existingQuest && existingQuest.repeatable,
		rewards: existingQuest && existingQuest.rewards,
		requirements: existingQuest && existingQuest.requirements,
		pages: state.pages,
		connections: state.connections,
		trash: state.trash,
		pan: state.pan,
		zoom: state.zoom,
		updatedAt: Date.now()
	};
	store.activeQuestId = state.questId;
	store.activeQuestlineId = null;
	store.nextPageId = state.nextPageId;
	store.nextConnId = state.nextConnId;
	saveStore(store);
	flashSaved();
}

/* Splits the merged questline canvas back into each member quest's record
   (by ._questId). ._cross connections are saved on the questline record. */
export function persistCurrentQuestline() {
	if (READ_ONLY) return;
	var store = loadStore();
	var crossConns = state.connections.filter(function (c) { return c._cross; }).map(function (c) {
		var out = { id: c.id, from: c.from, to: c.to, fromSide: c.fromSide, toSide: c.toSide };
		if (c.label) out.label = c.label;
		return out;
	});
	// Member pages are re-anchored near the origin below, so save each
	// section's questline-canvas position separately for
	// layoutQuestlineSections() to restore.
	var sectionPositions = {};
	state.questlineMembers.forEach(function (m) {
		var memberPages = state.pages.filter(function (p) { return p._questId === m.questId; });
		if (!memberPages.length) return;
		var minX = Infinity, minY = Infinity;
		memberPages.forEach(function (p) {
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
		});
		sectionPositions[m.questId] = { x: minX, y: minY };
	});
	state.questlineMembers.forEach(function (m) {
		var existing = store.quests[m.questId] || {};
		var memberPages = state.pages.filter(function (p) { return p._questId === m.questId; });
		var trash = state.trash.filter(function (t) { return t._questId === m.questId; });
		var pageIds = {};
		memberPages.forEach(function (p) { pageIds[p.id] = true; });
		var connections = state.connections.filter(function (c) { return !c._cross && pageIds[c.from] && pageIds[c.to]; });
		// On the questline canvas, lower sections can sit thousands of pixels
		// down. Save a copy shifted near the origin so the quest opens on its
		// own in view. The live state.pages are left in place.
		var minX = Infinity, minY = Infinity;
		memberPages.forEach(function (p) {
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
		});
		var shiftX = (minX === Infinity ? 40 : minX) - 40;
		var shiftY = (minY === Infinity ? 40 : minY) - 40;
		var pages = memberPages.map(function (p) {
			var clone = {};
			for (var key in p) { if (key !== '_questId') clone[key] = p[key]; }
			clone.x = p.x - shiftX;
			clone.y = p.y - shiftY;
			return clone;
		});
		store.quests[m.questId] = {
			id: m.questId,
			name: existing.name || m.name,
			questlineId: state.activeQuestlineId,
			status: existing.status,
			order: existing.order,
			// Keep stored metadata (see persistCurrentQuest).
			description: existing.description,
			repeatable: existing.repeatable,
			rewards: existing.rewards,
			requirements: existing.requirements,
			pages: pages,
			connections: connections,
			trash: trash,
			pan: existing.pan,
			zoom: existing.zoom,
			updatedAt: Date.now()
		};
	});
	if (store.questlines[state.activeQuestlineId]) {
		store.questlines[state.activeQuestlineId].connections = crossConns;
		store.questlines[state.activeQuestlineId].sectionPositions = sectionPositions;
	}
	store.activeQuestId = null;
	store.activeQuestlineId = state.activeQuestlineId;
	store.nextPageId = state.nextPageId;
	store.nextConnId = state.nextConnId;
	saveStore(store);
	flashSaved();
}

export function persistCurrent() {
	if (READ_ONLY) return;
	if (state.activeQuestlineId) persistCurrentQuestline();
	else persistCurrentQuest();
}

var autosaveTimer = null;
export function scheduleAutosave() {
	if (READ_ONLY) return;
	if (!state.questId && !state.activeQuestlineId) return;
	if (autosaveTimer) clearTimeout(autosaveTimer);
	autosaveTimer = setTimeout(function () {
		autosaveTimer = null;
		persistCurrent();
	}, 600);
}

/* Cancels a pending autosave. Used when a view switch flushes state
   itself, so a stale autosave doesn't fire later. */
export function cancelAutosave() {
	if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
}

var flashTimer = null;
export function flashStatus(text, ms) {
	if (!elSaveStatus) return;
	elSaveStatus.textContent = text;
	elSaveStatus.classList.add('show');
	if (flashTimer) clearTimeout(flashTimer);
	flashTimer = setTimeout(function () { elSaveStatus.classList.remove('show'); }, ms || 1600);
}

export function flashSaved() {
	flashStatus('Saved to this browser', 1600);
}

export function updateQuestPill() {
	if (!elQuestPill) return;
	if (state.activeQuestlineId) {
		var store = loadStore();
		var ql = store.questlines[state.activeQuestlineId];
		elQuestPill.textContent = (ql ? ql.name : 'Questline') + ' (questline)';
	} else {
		elQuestPill.textContent = state.questName;
	}
}
