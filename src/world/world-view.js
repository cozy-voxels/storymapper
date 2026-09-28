import { state, loadStore, saveStore, genId } from '../state/store.js';
import {
  elCanvasArea, elLibraryView, elWorldView,
  elWorldDirectory, elWorldDetail, elWorldLists,
  elWorldDetailViewMode, elWorldDetailEditMode, elWorldDetailKind, elWorldDetailTitle,
  elWorldDetailFields, elWorldDetailEditFields, elWorldDetailEditBtn,
  elWorldDetailSaveBtn, elWorldDetailCancelBtn, elWorldDetailDeleteBtn,
  elWorldDetailCrumbWorld, elWorldDetailCrumbCategory, elWorldDetailCrumbName
} from '../dom.js';
import { escapeHtml, compareNames } from '../utils/text.js';
import { autoSizeTextarea } from '../utils/textarea.js';
import { closeConnLabelChooser } from '../render/wires.js';
import { persistCurrent, cancelAutosave, flashSaved } from '../state/persist.js';
import { updateTopbarForView } from '../views.js';
import { questsLinkingToWorldItem } from '../state/links.js';
import { switchToQuest } from '../state/quest-switch.js';
import { notifyViewChange } from '../state/view-events.js';
import { READ_ONLY } from '../mode.js';

/* ================= world view (Factions / NPCs / Locations) =================
   Directory and item-detail views, re-rendered from store.world on every
   change, like the library. */
var WORLD_SCHEMAS = {
  factions: {
    label: 'Factions', singular: 'Faction', newName: 'New Faction',
    fields: [
      {key: 'name', label: 'Name', type: 'text'},
      {key: 'ideasGoals', label: 'Ideas & Goals', type: 'textarea'},
      {key: 'symbol', label: 'Symbol/Emblem', type: 'text'},
      {key: 'colors', label: 'Color(s)', type: 'text'},
      {key: 'motto', label: 'Motto', type: 'text'},
      {key: 'enemyCreatures', label: 'Enemy Creatures', type: 'textarea'},
      {key: 'mount', label: 'Mount', type: 'text'},
      {key: 'hqBuildings', label: 'HQ & Buildings', type: 'textarea'},
      {key: 'orgHierarchy', label: 'Org Hierarchy', type: 'textarea'},
      {key: 'people', label: 'People (Leaders & Members)', type: 'textarea'}
    ],
    subtitle: function(item){ return item.ideasGoals ? truncateForRow(item.ideasGoals) : ''; }
  },
  npcs: {
    label: 'NPCs', singular: 'NPC', newName: 'New NPC',
    fields: [
      {key: 'name', label: 'Name', type: 'text'},
      {key: 'role', label: 'Role / Title', type: 'text'},
      {key: 'description', label: 'Description', type: 'textarea'},
      {key: 'affiliation', label: 'Faction', type: 'faction-select'},
      {key: 'location', label: 'Location', type: 'location'},
      {key: 'notes', label: 'Notes', type: 'textarea'}
    ],
    subtitle: function(item, store){
      var parts = [];
      if(item.role) parts.push(item.role);
      var factionName = item.affiliation ? factionNameById(store, item.affiliation) : '';
      if(factionName) parts.push(factionName);
      return parts.join(' · ');
    }
  },
  locations: {
    label: 'Locations', singular: 'Location', newName: 'New Location',
    fields: [
      {key: 'name', label: 'Name', type: 'text'},
      {key: 'regionType', label: 'Region / Type', type: 'text'},
      {key: 'description', label: 'Description', type: 'textarea'},
      {key: 'faction', label: 'Faction', type: 'faction-select'},
      {key: 'notablePresence', label: 'NPCs', type: 'textarea'},
      {key: 'notes', label: 'Notes', type: 'textarea'}
    ],
    subtitle: function(item, store){
      var parts = [];
      if(item.regionType) parts.push(item.regionType);
      var factionName = item.faction ? factionNameById(store, item.faction) : '';
      if(factionName) parts.push(factionName);
      return parts.join(' · ');
    }
  }
};
var WORLD_CATEGORIES = ['factions', 'npcs', 'locations'];

function truncateForRow(s){
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

/* Returns the faction's current name, or '' if the id is blank or unknown
   (deleted, or old free-text data). */
function factionNameById(store, id){
  var f = (store.world.factions || {})[id];
  return f ? (f.name || 'Untitled Faction') : '';
}

/* An NPC's location is stored as {id, detail}. Older data is a plain
   string, which is treated as the detail. */
function locationValue(item){
  var v = item.location;
  if(v && typeof v === 'object') return {id: v.id || '', detail: v.detail || ''};
  return {id: '', detail: v || ''};
}

function locationNameById(store, id){
  var l = (store.world.locations || {})[id];
  return l ? (l.name || 'Untitled Location') : '';
}

var LOCATION_SEARCH_RESULTS_MAX = 20;
function locationSearchResultsHtml(store, query){
  var locations = store.world.locations || {};
  var q = (query || '').trim().toLowerCase();
  var ids = Object.keys(locations).filter(function(id){
    if(!q) return true;
    return (locations[id].name || '').toLowerCase().indexOf(q) !== -1;
  }).sort(function(a, b){ return compareNames(locations[a].name, locations[b].name); })
    .slice(0, LOCATION_SEARCH_RESULTS_MAX);
  if(!ids.length){
    return '<div class="location-search-empty">' +
      (Object.keys(locations).length ? 'No locations match &ldquo;' + escapeHtml(query) + '&rdquo;.' : 'No locations yet &mdash; add one in the Locations section.') +
      '</div>';
  }
  return ids.map(function(id){
    return '<button type="button" class="location-result-item" data-id="' + id + '">' +
      escapeHtml(locations[id].name || 'Untitled Location') + '</button>';
  }).join('');
}

function factionSelectOptionsHtml(store, selectedId){
  var factions = store.world.factions || {};
  var ids = Object.keys(factions).sort(function(a, b){ return compareNames(factions[a].name, factions[b].name); });
  var html = '<option value="">— None —</option>';
  ids.forEach(function(fid){
    html += '<option value="' + fid + '"' + (fid === selectedId ? ' selected' : '') + '>' +
      escapeHtml(factions[fid].name || 'Untitled Faction') + '</option>';
  });
  return html;
}

/* Items in a category whose keyField points at this faction, sorted by name. */
function itemsForFaction(store, category, keyField, factionId){
  var items = store.world[category] || {};
  return Object.keys(items)
    .filter(function(id){ return items[id][keyField] === factionId; })
    .map(function(id){ return {id: id, item: items[id]}; })
    .sort(function(a, b){ return compareNames(a.item.name, b.item.name); });
}

/* NPCs whose location points at this location, sorted by name. */
function npcsForLocation(store, locationId){
  var npcs = store.world.npcs || {};
  return Object.keys(npcs)
    .filter(function(id){ return locationValue(npcs[id]).id === locationId; })
    .map(function(id){ return {id: id, item: npcs[id]}; })
    .sort(function(a, b){ return compareNames(a.item.name, b.item.name); });
}

/* Clickable list of linked world items, shown above a field's text in view
   mode only. */
function linkedListHtml(category, entries){
  if(!entries.length) return '';
  var html = '<div class="linked-list">';
  entries.forEach(function(e){
    var name = e.item.name || 'Untitled';
    html += '<button type="button" class="linked-item" data-category="' + category + '" data-id="' + e.id + '">' +
      escapeHtml(name) + '</button>';
  });
  html += '</div>';
  return html;
}

function renderWorldDirectory(){
  var store = loadStore();
  WORLD_CATEGORIES.forEach(function(cat){
    var schema = WORLD_SCHEMAS[cat];
    var items = store.world[cat] || {};
    var ids = Object.keys(items).sort(function(a, b){ return compareNames(items[a].name, items[b].name); });
    var listEl = elWorldLists[cat];
    if(!listEl) return;
    if(!ids.length){
      listEl.innerHTML = '<div class="library-empty">No ' + schema.label.toLowerCase() + ' yet.</div>';
      return;
    }
    listEl.innerHTML = ids.map(function(id){
      var item = items[id];
      var sub = schema.subtitle(item, store);
      return '<div class="world-item-row" data-category="' + cat + '" data-id="' + id + '">' +
        '<span class="world-item-name">' + escapeHtml(item.name || 'Untitled ' + schema.singular) + '</span>' +
        (sub ? '<span class="world-item-sub">' + escapeHtml(sub) + '</span>' : '') +
      '</div>';
    }).join('');
  });
}

export function showWorldView(){
  closeConnLabelChooser();
  if(state.questId || state.activeQuestlineId){
    cancelAutosave();
    persistCurrent();
  }
  state.questId = null;
  state.activeQuestlineId = null;
  state.view = 'world';
  state.worldCategory = null;
  state.worldItemId = null;
  elCanvasArea.style.display = 'none';
  elLibraryView.classList.remove('open');
  elWorldView.classList.add('open');
  elWorldDetail.hidden = true;
  elWorldDirectory.hidden = false;
  updateTopbarForView();
  renderWorldDirectory();
  notifyViewChange();
}

function worldItemById(category, id){
  var store = loadStore();
  return (store.world[category] || {})[id] || null;
}

export function showWorldItem(category, id){
  if(!WORLD_SCHEMAS[category] || !worldItemById(category, id)) return;
  state.view = 'world-item';
  state.worldCategory = category;
  state.worldItemId = id;
  elCanvasArea.style.display = 'none';
  elLibraryView.classList.remove('open');
  elWorldView.classList.add('open');
  elWorldDirectory.hidden = true;
  elWorldDetail.hidden = false;
  updateTopbarForView();
  renderWorldDetail();
  notifyViewChange();
}

/* Rebuilds the detail view and edit form from the store. */
function renderWorldDetail(edit){
  var category = state.worldCategory;
  var store = loadStore();
  var item = (store.world[category] || {})[state.worldItemId];
  if(!item){ showWorldView(); return; }
  var schema = WORLD_SCHEMAS[category];

  elWorldDetailCrumbCategory.textContent = schema.label;
  elWorldDetailCrumbName.textContent = item.name || 'Untitled ' + schema.singular;
  elWorldDetailKind.textContent = schema.singular;
  elWorldDetailTitle.textContent = item.name || 'Untitled ' + schema.singular;

  var fieldsHtml = '';
  schema.fields.forEach(function(f){
    if(f.key === 'name') return; // shown as the title
    if(f.type === 'location'){
      var loc = locationValue(item);
      var locName = loc.id ? locationNameById(store, loc.id) : '';
      // Location link, then the free-text detail.
      var linkHtml = locName
        ? '<button type="button" class="linked-item" data-category="locations" data-id="' + loc.id + '">' + escapeHtml(locName) + '</button>'
        : '<div class="value">&mdash;</div>';
      var detailHtml = loc.detail ? '<div class="value location-detail">' + escapeHtml(loc.detail) + '</div>' : '';
      fieldsHtml += '<div class="world-field"><label>' + escapeHtml(f.label) + '</label>' + linkHtml + detailHtml + '</div>';
      return;
    }
    if(f.type === 'faction-select'){
      var facId = item[f.key];
      var facName = facId ? factionNameById(store, facId) : '';
      var facLinkHtml = facName
        ? '<button type="button" class="linked-item" data-category="factions" data-id="' + facId + '">' + escapeHtml(facName) + '</button>'
        : '<div class="value">&mdash;</div>';
      fieldsHtml += '<div class="world-field"><label>' + escapeHtml(f.label) + '</label>' + facLinkHtml + '</div>';
      return;
    }
    var displayVal = item[f.key] || '';
    var extraHtml = '';
    // Some free-text fields also list the items that link here (view mode only).
    if(category === 'factions'){
      if(f.key === 'hqBuildings'){
        extraHtml = linkedListHtml('locations', itemsForFaction(store, 'locations', 'faction', state.worldItemId));
      } else if(f.key === 'people'){
        extraHtml = linkedListHtml('npcs', itemsForFaction(store, 'npcs', 'affiliation', state.worldItemId));
      }
    } else if(category === 'locations' && f.key === 'notablePresence'){
      extraHtml = linkedListHtml('npcs', npcsForLocation(store, state.worldItemId));
    }
    fieldsHtml += '<div class="world-field"><label>' + escapeHtml(f.label) + '</label>' +
      extraHtml + '<div class="value">' + escapeHtml(displayVal) + '</div></div>';
  });

  // Quests whose pages link here (see links.js). Quest pages only link
  // NPCs and Locations.
  if(category === 'npcs' || category === 'locations'){
    var linkedQuests = questsLinkingToWorldItem(store, category, state.worldItemId);
    if(linkedQuests.length){
      fieldsHtml += '<div class="world-field"><label>Linked Quests</label><div class="linked-list">' +
        linkedQuests.map(function(r){
          return '<button type="button" class="linked-item linked-item-quest" data-quest-id="' + r.id + '">' +
            escapeHtml(r.quest.name || 'Untitled Quest') + '</button>';
        }).join('') +
      '</div></div>';
    }
  }
  elWorldDetailFields.innerHTML = fieldsHtml;

  if(READ_ONLY) return;

  var editHtml = '';
  schema.fields.forEach(function(f){
    if(f.type === 'location'){
      var loc = locationValue(item);
      var locName = loc.id ? locationNameById(store, loc.id) : '';
      editHtml += '<div class="modal-row location-field">' +
        '<label for="world-edit-location-search">' + escapeHtml(f.label) + '</label>' +
        '<div class="location-picker">' +
          '<input type="text" id="world-edit-location-search" class="location-search-input" placeholder="Search locations&hellip;" autocomplete="off" value="' + escapeHtml(locName) + '">' +
          '<button type="button" class="location-clear-btn" id="world-edit-location-clear"' + (loc.id ? '' : ' hidden') + ' title="Clear location" aria-label="Clear location">&times;</button>' +
          '<input type="hidden" id="world-edit-location-id" value="' + escapeHtml(loc.id) + '">' +
          '<div class="location-search-results" id="world-edit-location-results" hidden></div>' +
        '</div>' +
        '<textarea id="world-edit-location-detail" rows="2" placeholder="Additional detail (optional) &mdash; a specific room, landmark, or how to find them there">' + escapeHtml(loc.detail) + '</textarea>' +
      '</div>';
      return;
    }
    var val = escapeHtml(item[f.key] || '');
    var control;
    if(f.type === 'textarea'){
      control = '<textarea id="world-edit-' + f.key + '" data-key="' + f.key + '" rows="3">' + val + '</textarea>';
    } else if(f.type === 'faction-select'){
      control = '<select id="world-edit-' + f.key + '" data-key="' + f.key + '">' + factionSelectOptionsHtml(store, item[f.key] || '') + '</select>';
    } else {
      control = '<input type="text" id="world-edit-' + f.key + '" data-key="' + f.key + '" value="' + val + '">';
    }
    editHtml += '<div class="modal-row"><label for="world-edit-' + f.key + '">' + escapeHtml(f.label) + '</label>' + control + '</div>';
  });
  elWorldDetailEditFields.innerHTML = editHtml;

  resetWorldDeleteArm();
  setWorldDetailEditing(!!edit);
}

function setWorldDetailEditing(editing){
  elWorldDetailViewMode.hidden = editing;
  elWorldDetailEditMode.hidden = !editing;
  if(editing){
    elWorldDetailEditFields.querySelectorAll('textarea').forEach(autoSizeTextarea);
    var first = elWorldDetailEditFields.querySelector('input, textarea');
    if(first) first.focus();
  }
}

elWorldDetailFields.addEventListener('click', function(e){
  var questLink = e.target.closest('.linked-item-quest');
  if(questLink){ switchToQuest(questLink.dataset.questId); return; }
  var link = e.target.closest('.linked-item');
  if(link) showWorldItem(link.dataset.category, link.dataset.id);
});

/* ---- NPC "Location" search/select (edit mode) ----
   Combobox: typing filters locations by name, a result sets the location,
   and × clears it. Selection uses mousedown + preventDefault() so the
   input's blur doesn't hide the dropdown before the pick registers. */
function showLocationResults(){
  var store = loadStore();
  var input = document.getElementById('world-edit-location-search');
  var results = document.getElementById('world-edit-location-results');
  if(!input || !results) return;
  results.innerHTML = locationSearchResultsHtml(store, input.value);
  results.hidden = false;
}
function hideLocationResults(){
  var results = document.getElementById('world-edit-location-results');
  if(results) results.hidden = true;
}
function selectLocation(id, name){
  var idEl = document.getElementById('world-edit-location-id');
  var searchEl = document.getElementById('world-edit-location-search');
  var clearBtn = document.getElementById('world-edit-location-clear');
  if(idEl) idEl.value = id;
  if(searchEl) searchEl.value = name;
  if(clearBtn) clearBtn.hidden = false;
  hideLocationResults();
}
function clearLocation(){
  var idEl = document.getElementById('world-edit-location-id');
  var searchEl = document.getElementById('world-edit-location-search');
  var clearBtn = document.getElementById('world-edit-location-clear');
  if(idEl) idEl.value = '';
  if(searchEl) searchEl.value = '';
  if(clearBtn) clearBtn.hidden = true;
  if(searchEl) searchEl.focus();
  showLocationResults();
}
if(elWorldDetailEditFields) elWorldDetailEditFields.addEventListener('input', function(e){
  if(e.target.tagName === 'TEXTAREA') autoSizeTextarea(e.target);
  if(e.target.id === 'world-edit-location-search') showLocationResults();
});
if(elWorldDetailEditFields) elWorldDetailEditFields.addEventListener('focus', function(e){
  if(e.target.id === 'world-edit-location-search') showLocationResults();
}, true); // capture: focus doesn't bubble
if(elWorldDetailEditFields) elWorldDetailEditFields.addEventListener('focusout', function(e){
  if(e.target.id !== 'world-edit-location-search') return;
  // Delay so the result/clear mousedown handler runs first.
  setTimeout(hideLocationResults, 150);
});
if(elWorldDetailEditFields) elWorldDetailEditFields.addEventListener('mousedown', function(e){
  var result = e.target.closest('.location-result-item');
  if(result){
    e.preventDefault();
    selectLocation(result.dataset.id, result.textContent);
    return;
  }
  if(e.target.closest('#world-edit-location-clear')){
    e.preventDefault();
    clearLocation();
  }
});
if(elWorldDetailEditFields) elWorldDetailEditFields.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && e.target.id === 'world-edit-location-search') hideLocationResults();
});

if(elWorldDetailEditBtn) elWorldDetailEditBtn.addEventListener('click', function(){ setWorldDetailEditing(true); });
if(elWorldDetailCancelBtn) elWorldDetailCancelBtn.addEventListener('click', function(){ renderWorldDetail(false); });

if(elWorldDetailSaveBtn) elWorldDetailSaveBtn.addEventListener('click', function(){
  var category = state.worldCategory, id = state.worldItemId;
  var schema = WORLD_SCHEMAS[category];
  var store = loadStore();
  var item = (store.world[category] || {})[id];
  if(!item) return;
  schema.fields.forEach(function(f){
    if(f.type === 'location'){
      var idEl = document.getElementById('world-edit-location-id');
      var detailEl = document.getElementById('world-edit-location-detail');
      item.location = {id: idEl ? idEl.value : '', detail: detailEl ? detailEl.value : ''};
      return;
    }
    var el = document.getElementById('world-edit-' + f.key);
    if(!el) return;
    item[f.key] = el.value;
  });
  if(!item.name || !item.name.trim()) item.name = 'Untitled ' + schema.singular;
  saveStore(store);
  flashSaved();
  renderWorldDetail(false);
});

// Arm-then-confirm delete; see confirmDangerClick in library-view.js.
var worldDeleteArmed = false;
var worldDeleteArmTimer = null;
function resetWorldDeleteArm(){
  worldDeleteArmed = false;
  if(worldDeleteArmTimer){ clearTimeout(worldDeleteArmTimer); worldDeleteArmTimer = null; }
  if(elWorldDetailDeleteBtn) elWorldDetailDeleteBtn.textContent = 'Delete';
}
if(elWorldDetailDeleteBtn) elWorldDetailDeleteBtn.addEventListener('click', function(){
  var category = state.worldCategory, id = state.worldItemId;
  if(!worldDeleteArmed){
    worldDeleteArmed = true;
    elWorldDetailDeleteBtn.textContent = 'Click again to confirm delete';
    worldDeleteArmTimer = setTimeout(resetWorldDeleteArm, 4000);
    return;
  }
  resetWorldDeleteArm();
  var store = loadStore();
  if(store.world[category]) delete store.world[category][id];
  saveStore(store);
  showWorldView();
});

elWorldDetailCrumbWorld.addEventListener('click', showWorldView);

// Categories are sections of the World page, so the category crumb opens
// the World page scrolled to that section.
elWorldDetailCrumbCategory.addEventListener('click', function(){
  var cat = state.worldCategory;
  showWorldView();
  var target = document.getElementById('world-section-' + cat);
  if(target) target.scrollIntoView({behavior: 'smooth', block: 'start'});
});

document.getElementById('world-directory').addEventListener('click', function(e){
  var addBtn = !READ_ONLY && e.target.closest('[data-role="add-world-item"]');
  if(addBtn){
    var category = addBtn.dataset.category;
    var schema = WORLD_SCHEMAS[category];
    var store = loadStore();
    var id = genId();
    var item = {id: id, name: schema.newName};
    schema.fields.forEach(function(f){ if(!(f.key in item)) item[f.key] = ''; });
    store.world[category][id] = item;
    saveStore(store);
    showWorldItem(category, id);
    renderWorldDetail(true);
    return;
  }
  var row = e.target.closest('.world-item-row');
  if(row) showWorldItem(row.dataset.category, row.dataset.id);
});
