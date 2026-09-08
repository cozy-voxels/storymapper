import { state, loadStore, saveStore, genId } from '../state/store.js';
import {
  elViewport, elLibraryView, elWorldView,
  elWorldDirectory, elWorldDetail, elWorldLists,
  elWorldDetailViewMode, elWorldDetailEditMode, elWorldDetailKind, elWorldDetailTitle,
  elWorldDetailFields, elWorldDetailEditFields, elWorldDetailEditBtn,
  elWorldDetailSaveBtn, elWorldDetailCancelBtn, elWorldDetailDeleteBtn,
  elWorldDetailCrumbWorld, elWorldDetailCrumbCategory, elWorldDetailCrumbName
} from '../dom.js';
import { escapeHtml } from '../utils/text.js';
import { closeConnLabelChooser } from '../render/wires.js';
import { persistCurrent, cancelAutosave, flashSaved } from '../state/persist.js';
import { updateTopbarForView } from '../views.js';

/* ================= world view (Factions / NPCs / Locations) =================
   A simple directory + item-detail pair of views, built the same way the
   Story library is: plain rows read straight from the store, re-rendered
   on every change rather than kept in sync incrementally. Persisted in the
   same localStorage-backed store as everything else (store.world), so no
   new persistence mechanism is introduced. */
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
      {key: 'location', label: 'Location', type: 'text'},
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
      {key: 'notablePresence', label: 'Notable NPCs / Factions', type: 'textarea'},
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

/* Resolves a faction id (stored on an NPC's "Faction" field or a
   Location's "Faction" field) to that faction's current name, so
   renaming a faction is reflected everywhere it's referenced instead of
   baking the old name in at selection time. Returns '' for a blank id
   or one that no longer matches any faction (e.g. the faction was
   deleted, or — for data typed in before this was a dropdown — the id
   column now holds old free-text that was never a real faction id). */
function factionNameById(store, id){
  var f = (store.world.factions || {})[id];
  return f ? (f.name || 'Untitled Faction') : '';
}

function factionSelectOptionsHtml(store, selectedId){
  var factions = store.world.factions || {};
  var ids = Object.keys(factions);
  var html = '<option value="">— None —</option>';
  ids.forEach(function(fid){
    html += '<option value="' + fid + '"' + (fid === selectedId ? ' selected' : '') + '>' +
      escapeHtml(factions[fid].name || 'Untitled Faction') + '</option>';
  });
  return html;
}

/* Finds every item in a category (npcs or locations) whose faction-select
   field (keyField) points at this faction — the reverse lookup that lets a
   faction's own page show "who/what actually links here" without a real
   relational DB, following the same id + filter pattern already used for
   quest page connections (see pageById/renderWires). */
function itemsForFaction(store, category, keyField, factionId){
  var items = store.world[category] || {};
  return Object.keys(items)
    .filter(function(id){ return items[id][keyField] === factionId; })
    .map(function(id){ return {id: id, item: items[id]}; });
}

/* Renders a faction detail's supplementary "linked items" list — clickable
   names of NPCs/Locations that reference this faction — shown below the
   existing free-text field, in view mode only (never in the edit form,
   since these links are derived, not something to hand-edit here). */
function linkedListHtml(category, entries, label){
  if(!entries.length) return '';
  var html = '<div class="linked-list"><div class="linked-list-label">' + escapeHtml(label) + '</div>';
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
    var ids = Object.keys(items);
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
  elViewport.style.display = 'none';
  elLibraryView.classList.remove('open');
  elWorldView.classList.add('open');
  elWorldDetail.hidden = true;
  elWorldDirectory.hidden = false;
  updateTopbarForView();
  renderWorldDirectory();
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
  elViewport.style.display = 'none';
  elLibraryView.classList.remove('open');
  elWorldView.classList.add('open');
  elWorldDirectory.hidden = true;
  elWorldDetail.hidden = false;
  updateTopbarForView();
  renderWorldDetail();
}

/* Renders the current world-item detail view. Always rebuilds both the
   read-only view and the (hidden unless active) edit form from the store,
   so switching items or re-entering the view never shows stale data. */
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
    if(f.key === 'name') return; // name is already the page title above
    var displayVal = f.type === 'faction-select'
      ? (item[f.key] ? factionNameById(store, item[f.key]) : '')
      : (item[f.key] || '');
    var extraHtml = '';
    // Faction pages only: supplement the free-text HQ & Buildings / People
    // fields with a live, clickable list of the Locations/NPCs that
    // actually reference this faction — additive, not a replacement, and
    // view-mode only (edit() form below never gets this).
    if(category === 'factions'){
      if(f.key === 'hqBuildings'){
        extraHtml = linkedListHtml('locations', itemsForFaction(store, 'locations', 'faction', state.worldItemId), 'Linked Locations');
      } else if(f.key === 'people'){
        extraHtml = linkedListHtml('npcs', itemsForFaction(store, 'npcs', 'affiliation', state.worldItemId), 'Linked NPCs');
      }
    }
    fieldsHtml += '<div class="world-field"><label>' + escapeHtml(f.label) + '</label>' +
      '<div class="value">' + escapeHtml(displayVal) + '</div>' + extraHtml + '</div>';
  });
  elWorldDetailFields.innerHTML = fieldsHtml;

  var editHtml = '';
  schema.fields.forEach(function(f){
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
    var first = elWorldDetailEditFields.querySelector('input, textarea');
    if(first) first.focus();
  }
}

elWorldDetailFields.addEventListener('click', function(e){
  var link = e.target.closest('.linked-item');
  if(link) showWorldItem(link.dataset.category, link.dataset.id);
});

elWorldDetailEditBtn.addEventListener('click', function(){ setWorldDetailEditing(true); });
elWorldDetailCancelBtn.addEventListener('click', function(){ renderWorldDetail(false); });

elWorldDetailSaveBtn.addEventListener('click', function(){
  var category = state.worldCategory, id = state.worldItemId;
  var schema = WORLD_SCHEMAS[category];
  var store = loadStore();
  var item = (store.world[category] || {})[id];
  if(!item) return;
  schema.fields.forEach(function(f){
    var el = document.getElementById('world-edit-' + f.key);
    if(!el) return;
    item[f.key] = el.value;
  });
  if(!item.name || !item.name.trim()) item.name = 'Untitled ' + schema.singular;
  saveStore(store);
  flashSaved();
  renderWorldDetail(false);
});

// A sandboxed artifact page can't rely on window.confirm() (it's silently
// suppressed rather than shown), so deletion is armed by a first click and
// only actually happens on a second click shortly after — same "are you
// sure" safety net as a confirm dialog, just built from a plain button
// instead of one.
var worldDeleteArmed = false;
var worldDeleteArmTimer = null;
function resetWorldDeleteArm(){
  worldDeleteArmed = false;
  if(worldDeleteArmTimer){ clearTimeout(worldDeleteArmTimer); worldDeleteArmTimer = null; }
  if(elWorldDetailDeleteBtn) elWorldDetailDeleteBtn.textContent = 'Delete';
}
elWorldDetailDeleteBtn.addEventListener('click', function(){
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

// The category crumb (e.g. "Locations") has no page of its own — Factions/
// NPCs/Locations are just sections on the one World directory page — so
// rather than being inert, clicking it goes back to that directory and
// scrolls straight to the matching section heading, same as clicking
// "World" but landing you where you were instead of at the top.
elWorldDetailCrumbCategory.addEventListener('click', function(){
  var cat = state.worldCategory;
  showWorldView();
  var target = document.getElementById('world-section-' + cat);
  if(target) target.scrollIntoView({behavior: 'smooth', block: 'start'});
});

document.getElementById('world-directory').addEventListener('click', function(e){
  var addBtn = e.target.closest('[data-role="add-world-item"]');
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
