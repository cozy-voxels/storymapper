import { state, PRIMARY_KEYS, pageById } from '../state/store.js';
import { elCardsLayer } from '../dom.js';
import { escapeHtml, formatInline, formatCardTitle, splitLines, renderBulletField, looksLikeBulletField, renderSimpleList } from '../utils/text.js';
import { renderWires } from './wires.js';
import { renderSections } from './sections.js';
import { openEditor } from '../editor/modal.js';

/* ================= rendering ================= */
export var CARD_W = 308;

export function fieldHtml(field){
  var keyLower = field.key.toLowerCase();
  if(keyLower === 'dialog'){
    return '<div class="field-block"><div class="field-label">Dialog</div>' +
      '<div class="field-prose">' + formatInline(field.value) + '</div></div>';
  }
  if(keyLower === 'response(s)' || keyLower === 'responses'){
    return '<div class="field-block"><div class="field-label">Response(s)</div>' +
      renderBulletField(field.value, 'response') + '</div>';
  }
  if(keyLower === 'journaltext'){
    return '<div class="field-block"><div class="field-label">Journal</div>' +
      '<div class="journal">' + formatInline(field.value) + '</div></div>';
  }
  if(keyLower === 'note(s)' || keyLower === 'notes'){
    return '<div class="field-block"><div class="field-label">Note(s)</div>' +
      renderBulletField(field.value, 'note') + '</div>';
  }
  if(keyLower === 'requirements'){
    return '<div class="field-block"><div class="field-label">Requirements</div>' +
      renderSimpleList(splitLines(field.value), 'note') + '</div>';
  }
  if(keyLower === 'objectives'){
    return '<div class="field-block"><div class="field-label">Objectives</div>' +
      renderSimpleList(splitLines(field.value), 'note') + '</div>';
  }
  if(keyLower === 'loadactions'){
    return '<div class="field-block"><div class="field-label">Load Actions</div>' +
      renderSimpleList(splitLines(field.value), 'note') + '</div>';
  }
  if(keyLower === 'location'){
    return '<div class="field-block kv-row"><span class="k">Location:</span><span class="v">' + formatInline(field.value) + '</span></div>';
  }
  if(looksLikeBulletField(field.value)){
    return '<div class="field-block"><div class="field-label">' + escapeHtml(field.key) + '</div>' +
      renderBulletField(field.value, 'note') + '</div>';
  }
  return '<div class="field-block"><div class="field-label">' + escapeHtml(field.key) + '</div>' +
    '<div class="field-prose">' + formatInline(field.value) + '</div></div>';
}

export function buildCardEl(page){
  var el = document.createElement('div');
  el.className = 'card' + (state.selectedCardIds.has(page.id) ? ' selected' : '');
  el.dataset.id = page.id;
  el.style.left = page.x + 'px';
  el.style.top = page.y + 'px';

  var primary = page.fields.filter(function(f){return PRIMARY_KEYS.indexOf(f.key.toLowerCase()) > -1;});
  var extra = page.fields.filter(function(f){return PRIMARY_KEYS.indexOf(f.key.toLowerCase()) === -1;});

  var html = '';
  html += '<div class="card-header">';
  html += '  <div class="card-titles">';
  html += '    <div class="card-name">' + formatCardTitle(page.title) + '</div>';
  html += '    <div class="card-pageid">' + escapeHtml(page.pageId) + '</div>';
  html += '  </div>';
  html += '  <div class="handle handle-top" data-side="top" tabindex="0" title="Drag to connect"></div>';
  html += '  <div class="handle handle-left" data-side="left" tabindex="0" title="Drag to connect"></div>';
  html += '  <div class="handle handle-right" data-side="right" tabindex="0" title="Drag to connect"></div>';
  html += '</div>';
  html += '<div class="card-body">';
  html += '  <div class="card-actions">';
  html += '    <button class="icon-btn edit-btn" title="Edit page" aria-label="Edit page">&#9998;</button>';
  html += '  </div>';
  primary.forEach(function(f){ html += fieldHtml(f); });
  if(extra.length){
    html += '<button class="expand-toggle" type="button">More <span class="chev">&#9662;</span></button>';
    html += '<div class="card-extra" hidden>';
    extra.forEach(function(f){ html += fieldHtml(f); });
    html += '</div>';
  }
  html += '</div>';

  el.innerHTML = html;
  return el;
}

export function renderAll(){
  elCardsLayer.innerHTML = '';
  state.pages.forEach(function(page){
    elCardsLayer.appendChild(buildCardEl(page));
  });
  renderWires();
  renderSections();
}

export function cardEl(id){
  return elCardsLayer.querySelector('.card[data-id="' + id + '"]');
}

/* Soft delete: the page moves to state.trash instead of being discarded,
   so a deletion is always recoverable. Its connections are dropped (a
   restored page comes back unattached, on purpose — reattaching after
   other things may have changed is the user's call, not ours to guess). */
export function removePage(id){
  var page = pageById(id);
  if(!page) return;
  state.pages = state.pages.filter(function(p){return p.id !== id;});
  state.connections = state.connections.filter(function(c){return c.from !== id && c.to !== id;});
  var entry = {page: page, deletedAt: Date.now()};
  // in a whole-questline view, carry the page's source-quest tag onto the
  // trash entry too, so persistCurrentQuestline() can still attribute it
  // back to the right quest when splitting the merged state on save
  if(page._questId) entry._questId = page._questId;
  state.trash.push(entry);
  state.selectedCardIds.delete(id);
  renderAll();
}

/* ---- card action buttons (edit / delete / expand) ---- */
elCardsLayer.addEventListener('click', function(e){
  var editBtn = e.target.closest('.edit-btn');
  if(editBtn){
    openEditor(editBtn.closest('.card').dataset.id);
    return;
  }
  var toggle = e.target.closest('.expand-toggle');
  if(toggle){
    var extra = toggle.parentNode.querySelector('.card-extra');
    var isHidden = extra.hasAttribute('hidden');
    if(isHidden){ extra.removeAttribute('hidden'); toggle.innerHTML = 'Less <span class="chev">&#9652;</span>'; }
    else { extra.setAttribute('hidden',''); toggle.innerHTML = 'More <span class="chev">&#9662;</span>'; }
  }
});
