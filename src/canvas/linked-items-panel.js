/* ================= linked items sidebar (canvas) =================
   The aggregate of every NPC/Location linked from any page currently on
   the canvas -- state.pages for a single quest, or the merged set of
   every member quest's pages when a whole questline is open -- shown
   deliberately NOT per-card (the same NPC often recurs across many
   pages, which would be repetitive there). A toggleable sidebar docked
   to the left of the canvas -- not a modal -- so it stays visible
   alongside the quest/questline while working, rather than blocking it
   the way the Trash/Validate panels do (those are genuinely modal
   actions; this is a reference panel meant to be left open). */
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

/* Called after anything that can change which quest/pages are on the
   canvas (a page's links edited and saved, a different quest switched
   into) so the sidebar never shows a stale quest's data while left open
   across those actions -- the whole point of it being a sidebar instead
   of a modal is that it can stay open through them. */
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
