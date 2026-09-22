import { state, pageById, loadStore } from '../state/store.js';
import {
  elViewport, elModal, elModalBackdrop, elModalName, elModalPageId, elModalFieldsList,
  elModalResponsesList, elModalSuggestedLinksRow, elModalSuggestedLinks
} from '../dom.js';
import { escapeHtml, parseResponses, serializeResponses, brToText, textToBr } from '../utils/text.js';
import { autoSizeTextarea } from '../utils/textarea.js';
import { toWorld } from '../canvas/pan-zoom.js';
import { renderAll, removePage } from '../render/cards.js';
import { initEntityPickers, getEntityPickerIds, addEntityLink } from '../ui/entity-picker.js';
import { suggestLinks } from '../import/link-suggestions.js';
import { refreshLinkedItemsPanelIfOpen } from '../canvas/linked-items-panel.js';

/* ================= edit modal ================= */

/* These five always get their own fixed textarea row in the editor,
   matching the PageData model fields (see ql_data-models.md). Response(s)
   is also fixed but gets its own structured row-list UI below instead of
   a single textarea (see responseRow()/RESPONSE_KEYS). Everything else on
   a page stays freeform under "Other Fields". */
var FIXED_FIELD_DEFS = [
  {match: ['dialog'], canonical: 'Dialog', el: 'modal-dialog'},
  {match: ['journaltext'], canonical: 'JournalText', el: 'modal-journaltext'},
  {match: ['requirements'], canonical: 'Requirements', el: 'modal-requirements'},
  {match: ['objectives'], canonical: 'Objectives', el: 'modal-objectives'},
  {match: ['loadactions'], canonical: 'LoadActions', el: 'modal-loadactions'}
];

var RESPONSE_KEYS = ['response(s)', 'responses'];

function isFixedKey(key){
  var lower = key.toLowerCase();
  if(RESPONSE_KEYS.indexOf(lower) > -1) return true;
  return FIXED_FIELD_DEFS.some(function(def){ return def.match.indexOf(lower) > -1; });
}

/* Recomputed from the modal's own live values (not the last-saved page) so
   a name typed just now shows up as a suggestion immediately, without
   requiring a save first. Includes the title and freeform "Other Fields"
   rows too, not just the six fixed fields -- a name can be mentioned
   anywhere on the page. */
function currentDraftPage(){
  var fields = FIXED_FIELD_DEFS.map(function(def){
    return {key: def.canonical, value: textToBr(document.getElementById(def.el).value)};
  });
  fields.push({key: 'Response(s)', value: serializeResponses(responsesFromRows())});
  elModalFieldsList.querySelectorAll('.field-row').forEach(function(row){
    fields.push({key: row.querySelector('.key').value, value: textToBr(row.querySelector('.val').value)});
  });
  return {title: elModalName.value, fields: fields};
}

function renderSuggestions(suggestions){
  if(!suggestions.length){
    elModalSuggestedLinksRow.hidden = true;
    elModalSuggestedLinks.innerHTML = '';
    return;
  }
  elModalSuggestedLinksRow.hidden = false;
  elModalSuggestedLinks.innerHTML = suggestions.map(function(s){
    return '<div class="suggested-link-item"><span>' + escapeHtml(s.name) + '</span>' +
      '<button type="button" class="btn" data-category="' + s.category + '" data-id="' + s.id + '">Add</button></div>';
  }).join('');
}

function refreshSuggestions(){
  var linked = {npcs: getEntityPickerIds('npcs'), locations: getEntityPickerIds('locations')};
  var suggestions = suggestLinks(currentDraftPage(), loadStore(), linked);
  renderSuggestions(suggestions);
}

elModalSuggestedLinks.addEventListener('click', function(e){
  var btn = e.target.closest('button[data-id]');
  if(!btn) return;
  addEntityLink(btn.dataset.category, btn.dataset.id);
});

/* Any input inside the modal can affect suggestions now -- title and the
   freeform "Other Fields" rows are scanned too, not just the six fixed
   fields -- so no target filtering here beyond "inside the modal". */
var suggestDebounceTimer = null;
elModal.addEventListener('input', function(e){
  if(e.target.tagName === 'TEXTAREA') autoSizeTextarea(e.target);
  clearTimeout(suggestDebounceTimer);
  suggestDebounceTimer = setTimeout(refreshSuggestions, 300);
});

function fieldRow(key, value){
  var row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = '<input class="key" type="text" value="' + escapeHtml(key) + '">' +
    '<textarea class="val" rows="2"></textarea>' +
    '<button type="button" title="Remove field" aria-label="Remove field">&times;</button>';
  var valTa = row.querySelector('.val');
  valTa.value = brToText(value);
  autoSizeTextarea(valTa);
  row.querySelector('button').addEventListener('click', function(){ row.remove(); });
  return row;
}

/* One Response(s) block: the choice text, plus two optional sub-sections
   (Requirement(s)/Action(s), each a newline-per-item textarea) toggled on
   by their own "+ Add" button -- mirrors the real QuestLines Response
   shape (Text/Requirements/Actions), see parseResponses()/serializeResponses(). */
function responseRow(resp){
  resp = resp || {text: '', requirements: [], actions: []};
  var row = document.createElement('div');
  row.className = 'response-row';
  row.innerHTML =
    '<div class="response-row-head">' +
      '<textarea class="resp-text" rows="1" placeholder="Response text"></textarea>' +
      '<button type="button" class="response-remove" title="Remove response" aria-label="Remove response">&times;</button>' +
    '</div>' +
    '<div class="response-subs"></div>' +
    '<div class="response-row-toggles">' +
      '<button type="button" class="response-add-sub" data-kind="requirements">+ Add Requirement(s)</button>' +
      '<button type="button" class="response-add-sub" data-kind="actions">+ Add Action(s)</button>' +
    '</div>';

  var textTa = row.querySelector('.resp-text');
  textTa.value = brToText(resp.text || '');
  autoSizeTextarea(textTa);
  row.querySelector('.response-remove').addEventListener('click', function(){ row.remove(); });

  var subsWrap = row.querySelector('.response-subs');
  var SUB_LABELS = {requirements: 'Requirement(s)', actions: 'Action(s)'};

  function updateToggleVisibility(){
    row.querySelectorAll('.response-add-sub').forEach(function(btn){
      btn.hidden = !!subsWrap.querySelector('.response-sub[data-kind="' + btn.dataset.kind + '"]');
    });
  }

  function addSub(kind, items){
    var sub = document.createElement('div');
    sub.className = 'response-sub';
    sub.dataset.kind = kind;
    sub.innerHTML = '<div class="response-sub-head"><label>' + SUB_LABELS[kind] + '</label>' +
      '<button type="button" class="response-sub-remove">Remove</button></div>' +
      '<textarea class="resp-' + kind + '" rows="2"></textarea>';
    var ta = sub.querySelector('textarea');
    ta.value = (items || []).map(brToText).join('\n');
    subsWrap.appendChild(sub);
    autoSizeTextarea(ta);
    sub.querySelector('.response-sub-remove').addEventListener('click', function(){
      sub.remove();
      updateToggleVisibility();
    });
    updateToggleVisibility();
  }

  row.querySelectorAll('.response-add-sub').forEach(function(btn){
    btn.addEventListener('click', function(){ addSub(btn.dataset.kind, []); });
  });

  if((resp.requirements || []).length) addSub('requirements', resp.requirements);
  if((resp.actions || []).length) addSub('actions', resp.actions);
  updateToggleVisibility();

  return row;
}

/* Reads the live #modal-responses-list rows back into
   {text, requirements[], actions[]} objects for serializeResponses(). */
function responsesFromRows(){
  var responses = [];
  elModalResponsesList.querySelectorAll('.response-row').forEach(function(row){
    function linesOf(selector){
      var ta = row.querySelector(selector);
      return ta ? ta.value.split('\n').map(function(s){ return textToBr(s.trim()); }).filter(Boolean) : [];
    }
    responses.push({
      text: textToBr(row.querySelector('.resp-text').value),
      requirements: linesOf('.resp-requirements'),
      actions: linesOf('.resp-actions')
    });
  });
  return responses;
}

document.getElementById('add-response-btn').addEventListener('click', function(){
  elModalResponsesList.appendChild(responseRow());
});

export function openEditor(cardId){
  var page = pageById(cardId);
  if(!page) return;
  state.editingCardId = cardId;
  elModalBackdrop.classList.add('open');
  elModalName.value = page.title;
  elModalPageId.value = page.pageId;

  FIXED_FIELD_DEFS.forEach(function(def){
    var found = page.fields.filter(function(f){
      return def.match.indexOf(f.key.toLowerCase()) > -1;
    })[0];
    var ta = document.getElementById(def.el);
    ta.value = brToText(found ? found.value : '');
    autoSizeTextarea(ta);
  });

  var responseField = page.fields.filter(function(f){
    return RESPONSE_KEYS.indexOf(f.key.toLowerCase()) > -1;
  })[0];
  var responses = responseField ? parseResponses(responseField.value) : [];
  if(!responses.length) responses = [{text: '', requirements: [], actions: []}];
  elModalResponsesList.innerHTML = '';
  responses.forEach(function(r){ elModalResponsesList.appendChild(responseRow(r)); });

  elModalFieldsList.innerHTML = '';
  page.fields.forEach(function(f){
    if(isFixedKey(f.key)) return;
    elModalFieldsList.appendChild(fieldRow(f.key, f.value));
  });

  // Every textarea just populated above was built (and auto-sized) while
  // detached from the document -- scrollHeight reads 0/wrong on a detached
  // node, so the resulting height is always the collapsed min-height no
  // matter how much text it holds. Re-run auto-size now that they're all
  // actually in the (now-visible) modal, so long content shows in full
  // instead of silently clipping with a hidden scrollbar.
  elModal.querySelectorAll('textarea').forEach(autoSizeTextarea);

  initEntityPickers(page, refreshSuggestions);
  refreshSuggestions();
  document.getElementById('modal-title').textContent = 'Edit page';
  elModalName.focus();
}

export function openNewCardEditor(){
  var wp = toWorld(elViewport.getBoundingClientRect().left + elViewport.clientWidth/2,
                    elViewport.getBoundingClientRect().top + elViewport.clientHeight/2);
  var page = {
    id: 'p' + (state.nextPageId++),
    title: '',
    pageId: 'new_page_id',
    fields: [{key:'Dialog', value:''}, {key:'Response(s)', value:'- '}],
    linkedNpcIds: [], linkedLocationIds: [],
    x: wp.x - 150, y: wp.y - 80
  };
  state.pages.push(page);
  renderAll();
  openEditor(page.id);
}

document.getElementById('add-field-btn').addEventListener('click', function(){
  elModalFieldsList.appendChild(fieldRow('New Field', ''));
});

document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && elModalBackdrop.classList.contains('open')) closeModal();
});

export function closeModal(){
  elModalBackdrop.classList.remove('open');
  state.editingCardId = null;
}

document.getElementById('modal-save').addEventListener('click', function(){
  var page = pageById(state.editingCardId);
  if(!page) return;
  page.title = elModalName.value.trim() || 'Unnamed NPC';
  page.pageId = elModalPageId.value.trim() || '—';

  var fields = [];
  FIXED_FIELD_DEFS.forEach(function(def){
    var v = textToBr(document.getElementById(def.el).value);
    if(v.trim()) fields.push({key: def.canonical, value: v});
  });
  var responsesValue = serializeResponses(responsesFromRows());
  if(responsesValue.trim()) fields.push({key: 'Response(s)', value: responsesValue});
  elModalFieldsList.querySelectorAll('.field-row').forEach(function(row){
    var k = row.querySelector('.key').value.trim();
    var v = textToBr(row.querySelector('.val').value);
    if(k) fields.push({key:k, value:v});
  });
  page.fields = fields;
  page.linkedNpcIds = getEntityPickerIds('npcs');
  page.linkedLocationIds = getEntityPickerIds('locations');
  closeModal();
  renderAll();
  refreshLinkedItemsPanelIfOpen();
});

document.getElementById('modal-delete').addEventListener('click', function(){
  var id = state.editingCardId;
  closeModal();
  if(id) removePage(id);
});

document.getElementById('add-card-btn').addEventListener('click', openNewCardEditor);
