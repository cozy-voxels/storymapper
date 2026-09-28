import { state, PRIMARY_KEYS, pageById } from '../state/store.js';
import { elCardsLayer } from '../dom.js';
import { escapeHtml, formatInline, formatCardTitle, splitLines, renderBulletField, looksLikeBulletField, renderSimpleList, parseResponses, renderResponses } from '../utils/text.js';
import { renderWires } from './wires.js';
import { renderSections } from './sections.js';
import { READ_ONLY } from '../mode.js';

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
      renderResponses(parseResponses(field.value)) + '</div>';
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
  // No handles or edit/copy buttons in the read-only viewer.
  if(!READ_ONLY){
    html += '  <div class="handle handle-top" data-side="top" tabindex="0" title="Drag to connect"></div>';
    html += '  <div class="handle handle-left" data-side="left" tabindex="0" title="Drag to connect"></div>';
    html += '  <div class="handle handle-right" data-side="right" tabindex="0" title="Drag to connect"></div>';
  }
  html += '</div>';
  html += '<div class="card-body">';
  if(!READ_ONLY){
    html += '  <div class="card-actions">';
    html += '    <button class="icon-btn edit-btn" title="Edit page" aria-label="Edit page">&#9998;</button>';
    html += '    <button class="icon-btn copy-btn" title="Copy page" aria-label="Copy page">&#10697;</button>';
    html += '  </div>';
  }
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

/* Soft delete: moves the page to state.trash and drops its connections.
   Restored pages come back unconnected. */
export function removePage(id){
  var page = pageById(id);
  if(!page) return;
  state.pages = state.pages.filter(function(p){return p.id !== id;});
  state.connections = state.connections.filter(function(c){return c.from !== id && c.to !== id;});
  var entry = {page: page, deletedAt: Date.now()};
  // keep _questId so persistCurrentQuestline() saves it to the right quest
  if(page._questId) entry._questId = page._questId;
  state.trash.push(entry);
  state.selectedCardIds.delete(id);
  renderAll();
}

/* Duplicates a page with a new id and a "-copy" pageId. Connections are
   not copied. */
export function duplicatePage(id){
  var page = pageById(id);
  if(!page) return;
  var copy = Object.assign({}, page, {
    id: 'p' + (state.nextPageId++),
    pageId: page.pageId + '-copy',
    fields: (page.fields || []).map(function(f){ return Object.assign({}, f); }),
    linkedNpcIds: (page.linkedNpcIds || []).slice(),
    linkedLocationIds: (page.linkedLocationIds || []).slice(),
    x: page.x + 30,
    y: page.y + 30
  });
  state.pages.push(copy);
  renderAll();
}

/* ---- card "More"/"Less" expand toggle ----
   The edit/copy handler is in editor/modal.js so the viewer can import
   this module without the editor. */
elCardsLayer.addEventListener('click', function(e){
  var toggle = e.target.closest('.expand-toggle');
  if(toggle){
    var extra = toggle.parentNode.querySelector('.card-extra');
    var isHidden = extra.hasAttribute('hidden');
    if(isHidden){ extra.removeAttribute('hidden'); toggle.innerHTML = 'Less <span class="chev">&#9652;</span>'; }
    else { extra.setAttribute('hidden',''); toggle.innerHTML = 'More <span class="chev">&#9662;</span>'; }
  }
});
