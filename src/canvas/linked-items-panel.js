/* ================= linked items sidebar (canvas) =================
   Toggleable, non-modal sidebar listing every NPC/Location linked from
   the pages on the canvas. */
import { state, loadStore } from '../state/store.js';
import { elLinkedItemsBtn, elLinkedItemsSidebar, elLinkedItemsSidebarClose, elLinkedItemsList } from '../dom.js';
import { escapeHtml } from '../utils/text.js';
import { linkedWorldItemsForPages } from '../state/links.js';
import { showWorldItem } from '../world/world-view.js';

function sectionHtml(label, entries, category){
  var html = '<div class="trash-section"><h3 class="trash-section-head">' + label + '</h3>';
  if(!entries.length){
    html += '<div class="trash-empty">None linked yet.</div>';
  } else {
    html += '<div class="linked-list">' + entries.map(function(e){
      return '<button type="button" class="linked-item" data-category="' + category + '" data-id="' + e.id + '">' +
        escapeHtml(e.item.name || 'Untitled') + '</button>';
    }).join('') + '</div>';
  }
  html += '</div>';
  return html;
}

export function renderLinkedItemsList(){
  var store = loadStore();
  var grouped = linkedWorldItemsForPages(state.pages, store);
  elLinkedItemsList.innerHTML =
    sectionHtml('NPCs', grouped.npcs, 'npcs') +
    sectionHtml('Locations', grouped.locations, 'locations');
}

/* Call after the canvas pages or their links change, so an open sidebar
   stays current. */
export function refreshLinkedItemsPanelIfOpen(){
  if(elLinkedItemsSidebar.classList.contains('open')) renderLinkedItemsList();
}

function setSidebarOpen(open){
  if(open) renderLinkedItemsList();
  elLinkedItemsSidebar.classList.toggle('open', open);
  if(elLinkedItemsBtn){
    elLinkedItemsBtn.classList.toggle('active', open);
    elLinkedItemsBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
  }
}

if(elLinkedItemsBtn){
  elLinkedItemsBtn.addEventListener('click', function(){
    setSidebarOpen(!elLinkedItemsSidebar.classList.contains('open'));
  });
}
elLinkedItemsSidebarClose.addEventListener('click', function(){
  setSidebarOpen(false);
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && elLinkedItemsSidebar.classList.contains('open')) setSidebarOpen(false);
});
elLinkedItemsList.addEventListener('click', function(e){
  var btn = e.target.closest('.linked-item');
  if(!btn) return;
  showWorldItem(btn.dataset.category, btn.dataset.id);
});
