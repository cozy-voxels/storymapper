/* ================= entity picker (multi-select) =================
   Multi-select comboboxes for the page editor's Linked NPCs / Linked
   Locations, modeled on the Location combobox in world-view.js.

   Edits a working copy of the id arrays until Save:
   initEntityPickers() loads it and getEntityPickerIds() reads it back. */
import { loadStore } from '../state/store.js';
import { escapeHtml, compareNames } from '../utils/text.js';
import { elModal, elModalName } from '../dom.js';

var ENTITY_SEARCH_RESULTS_MAX = 20;
var SINGULAR = { npcs: 'NPC', locations: 'location' };

export function applyLinkedNpcNameIfBlank(currentName, category, id, store) {
	if (category !== 'npcs' || !id || (currentName || '').trim()) return currentName || '';
	var worldNpcs = (store && store.world && store.world.npcs) || {};
	var npc = worldNpcs[id];
	if (!npc || !npc.name) return currentName || '';
	var nextName = String(npc.name).trim();
	return nextName || currentName || '';
}

var workingIds = { npcs: [], locations: [] };
var onChange = null;

export function initEntityPickers(page, changeCallback) {
	workingIds.npcs = (page.linkedNpcIds || []).slice();
	workingIds.locations = (page.linkedLocationIds || []).slice();
	onChange = changeCallback || null;
	['npcs', 'locations'].forEach(function (category) {
		var input = document.getElementById('modal-link-' + category + '-search');
		if (input) input.value = '';
		hideResults(category);
		renderChips(category);
	});
}

export function getEntityPickerIds(category) {
	return workingIds[category].slice();
}

export function addEntityLink(category, id) {
	if (workingIds[category].indexOf(id) === -1) workingIds[category].push(id);
	var nameValue = elModalName ? elModalName.value : '';
	var nextName = applyLinkedNpcNameIfBlank(nameValue, category, id, loadStore());
	if (elModalName && nextName !== nameValue) elModalName.value = nextName;
	var input = document.getElementById('modal-link-' + category + '-search');
	if (input) input.value = '';
	renderChips(category);
	hideResults(category);
	if (onChange) onChange();
}

function removeEntityLink(category, id) {
	workingIds[category] = workingIds[category].filter(function (x) { return x !== id; });
	renderChips(category);
	if (onChange) onChange();
}

function chipsHtml(store, category) {
	var items = (store.world || {})[category] || {};
	// Ids of deleted World items are kept but not shown.
	return workingIds[category].filter(function (id) { return items[id]; }).map(function (id) {
		var name = items[id].name || 'Untitled';
		return '<span class="entity-chip">' + escapeHtml(name) +
			'<button type="button" class="entity-chip-remove" data-category="' + category + '" data-id="' + id + '" aria-label="Remove ' + escapeHtml(name) + '">&times;</button></span>';
	}).join('');
}

function renderChips(category) {
	var el = document.getElementById('modal-link-' + category + '-chips');
	if (el) el.innerHTML = chipsHtml(loadStore(), category);
}

function searchResultsHtml(store, category, query) {
	var items = (store.world || {})[category] || {};
	var q = (query || '').trim().toLowerCase();
	var excluded = workingIds[category];
	var ids = Object.keys(items).filter(function (id) {
		if (excluded.indexOf(id) !== -1) return false;
		if (!q) return true;
		return (items[id].name || '').toLowerCase().indexOf(q) !== -1;
	}).sort(function (a, b) { return compareNames(items[a].name, items[b].name); })
		.slice(0, ENTITY_SEARCH_RESULTS_MAX);
	if (!ids.length) {
		return '<div class="entity-picker-empty">' +
			(Object.keys(items).length ? 'No matches.' : 'No ' + SINGULAR[category] + 's yet.') +
			'</div>';
	}
	return ids.map(function (id) {
		return '<button type="button" class="entity-result-item" data-id="' + id + '">' +
			escapeHtml(items[id].name || 'Untitled') + '</button>';
	}).join('');
}

function showResults(category) {
	var input = document.getElementById('modal-link-' + category + '-search');
	var results = document.getElementById('modal-link-' + category + '-results');
	if (!input || !results) return;
	results.innerHTML = searchResultsHtml(loadStore(), category, input.value);
	results.hidden = false;
}

function hideResults(category) {
	var results = document.getElementById('modal-link-' + category + '-results');
	if (results) results.hidden = true;
}

elModal.addEventListener('input', function (e) {
	var picker = e.target.closest('.entity-picker');
	if (picker && e.target.classList.contains('entity-picker-input')) showResults(picker.dataset.category);
});
elModal.addEventListener('focus', function (e) {
	var picker = e.target.closest('.entity-picker');
	if (picker && e.target.classList.contains('entity-picker-input')) showResults(picker.dataset.category);
}, true); // capture: focus doesn't bubble
elModal.addEventListener('focusout', function (e) {
	var picker = e.target.closest('.entity-picker');
	if (!picker || !e.target.classList.contains('entity-picker-input')) return;
	var category = picker.dataset.category;
	// Delay so the result mousedown handler runs first.
	setTimeout(function () { hideResults(category); }, 150);
});
elModal.addEventListener('mousedown', function (e) {
	var picker = e.target.closest('.entity-picker');
	if (picker) {
		var result = e.target.closest('.entity-result-item');
		if (result) {
			e.preventDefault();
			addEntityLink(picker.dataset.category, result.dataset.id);
			return;
		}
	}
	var removeBtn = e.target.closest('.entity-chip-remove');
	if (removeBtn) {
		e.preventDefault();
		removeEntityLink(removeBtn.dataset.category, removeBtn.dataset.id);
	}
});
elModal.addEventListener('keydown', function (e) {
	var picker = e.target.closest('.entity-picker');
	if (picker && e.target.classList.contains('entity-picker-input') && e.key === 'Escape') hideResults(picker.dataset.category);
});
