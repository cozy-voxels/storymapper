import { state, pageById } from '../state/store.js';
import { elViewport, elModalBackdrop, elModalName, elModalPageId, elModalFieldsList } from '../dom.js';
import { escapeHtml } from '../utils/text.js';
import { toWorld } from '../canvas/pan-zoom.js';
import { renderAll, removePage } from '../render/cards.js';

/* ================= edit modal ================= */

/* These six always get their own fixed row in the editor, matching the
   PageData model fields (see ql_data-models.md). Everything else on a
   page stays freeform under "Other Fields". */
var FIXED_FIELD_DEFS = [
  {match: ['dialog'], canonical: 'Dialog', el: 'modal-dialog'},
  {match: ['journaltext'], canonical: 'JournalText', el: 'modal-journaltext'},
  {match: ['response(s)', 'responses'], canonical: 'Response(s)', el: 'modal-responses'},
  {match: ['requirements'], canonical: 'Requirements', el: 'modal-requirements'},
  {match: ['objectives'], canonical: 'Objectives', el: 'modal-objectives'},
  {match: ['loadactions'], canonical: 'LoadActions', el: 'modal-loadactions'}
];

function isFixedKey(key){
  var lower = key.toLowerCase();
  return FIXED_FIELD_DEFS.some(function(def){ return def.match.indexOf(lower) > -1; });
}

function fieldRow(key, value){
  var row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = '<input class="key" type="text" value="' + escapeHtml(key) + '">' +
    '<textarea class="val" rows="2"></textarea>' +
    '<button type="button" title="Remove field" aria-label="Remove field">&times;</button>';
  row.querySelector('.val').value = value;
  row.querySelector('button').addEventListener('click', function(){ row.remove(); });
  return row;
}

export function openEditor(cardId){
  var page = pageById(cardId);
  if(!page) return;
  state.editingCardId = cardId;
  elModalName.value = page.title;
  elModalPageId.value = page.pageId;

  FIXED_FIELD_DEFS.forEach(function(def){
    var found = page.fields.filter(function(f){
      return def.match.indexOf(f.key.toLowerCase()) > -1;
    })[0];
    document.getElementById(def.el).value = found ? found.value : '';
  });

  elModalFieldsList.innerHTML = '';
  page.fields.forEach(function(f){
    if(isFixedKey(f.key)) return;
    elModalFieldsList.appendChild(fieldRow(f.key, f.value));
  });
  document.getElementById('modal-title').textContent = 'Edit page';
  elModalBackdrop.classList.add('open');
  elModalName.focus();
}

export function openNewCardEditor(){
  var wp = toWorld(elViewport.getBoundingClientRect().left + elViewport.clientWidth/2,
                    elViewport.getBoundingClientRect().top + elViewport.clientHeight/2);
  var page = {
    id: 'p' + (state.nextPageId++),
    title: 'New NPC',
    pageId: 'new_page_id',
    fields: [{key:'Dialog', value:''}, {key:'Response(s)', value:'- '}],
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
elModalBackdrop.addEventListener('mousedown', function(e){
  if(e.target === elModalBackdrop) closeModal();
});
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
    var v = document.getElementById(def.el).value;
    if(v.trim()) fields.push({key: def.canonical, value: v});
  });
  elModalFieldsList.querySelectorAll('.field-row').forEach(function(row){
    var k = row.querySelector('.key').value.trim();
    var v = row.querySelector('.val').value;
    if(k) fields.push({key:k, value:v});
  });
  page.fields = fields;
  closeModal();
  renderAll();
});

document.getElementById('modal-delete').addEventListener('click', function(){
  var id = state.editingCardId;
  closeModal();
  if(id) removePage(id);
});

document.getElementById('add-card-btn').addEventListener('click', openNewCardEditor);
