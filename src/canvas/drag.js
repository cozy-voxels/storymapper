import { state, pageById } from '../state/store.js';
import { elViewport, elMarqueeBox, elCardsLayer } from '../dom.js';
import { toWorld, isPanExcludedTarget } from './pan-zoom.js';
import { cardEl, CARD_W, renderAll } from '../render/cards.js';
import { renderWires, removeConnection, closeConnLabelChooser, showConnLabelChooser } from '../render/wires.js';
import { renderSections } from '../render/sections.js';
import { connecting, startConnecting, stopConnecting, updateTempWire, nearestSide } from './connect.js';
import { responseChoicesForPage } from '../utils/text.js';

/* ---- empty-canvas mousedown (editor only) ----
   Panning lives in pan-zoom.js; this adds the editor-only behavior. */
elViewport.addEventListener('mousedown', function(e){
  if(isPanExcludedTarget(e.target)) return;
  // Shift-drag draws a lasso instead of panning (pan-zoom.js skips shift-drags).
  if(e.shiftKey){
    startMarquee(e.clientX, e.clientY);
    return;
  }
  if(state.selectedConn){ state.selectedConn = null; renderWires(); }
  // A plain click also clears the lasso selection.
  if(state.selectedCardIds.size){ state.selectedCardIds.clear(); renderAll(); }
});

/* ---- lasso (shift-drag) multi-select for moving several cards at once.
   UI state only: never saved, and cleared on quest switch, Escape, or a
   click on empty canvas. ---- */
var marqueeDrag = null;
function startMarquee(clientX, clientY){
  marqueeDrag = {startX: clientX, startY: clientY};
  elMarqueeBox.style.left = clientX + 'px';
  elMarqueeBox.style.top = clientY + 'px';
  elMarqueeBox.style.width = '0px';
  elMarqueeBox.style.height = '0px';
  elMarqueeBox.style.display = 'block';
}
function updateMarquee(clientX, clientY){
  if(!marqueeDrag) return;
  var x0 = Math.min(marqueeDrag.startX, clientX), x1 = Math.max(marqueeDrag.startX, clientX);
  var y0 = Math.min(marqueeDrag.startY, clientY), y1 = Math.max(marqueeDrag.startY, clientY);
  elMarqueeBox.style.left = x0 + 'px';
  elMarqueeBox.style.top = y0 + 'px';
  elMarqueeBox.style.width = (x1 - x0) + 'px';
  elMarqueeBox.style.height = (y1 - y0) + 'px';
}
// Fallback card height when the card isn't rendered; close enough for
// lasso overlap.
var CARD_H_EST_SELECT = 220;
function finishMarquee(clientX, clientY){
  var a = toWorld(marqueeDrag.startX, marqueeDrag.startY);
  var b = toWorld(clientX, clientY);
  var minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  var minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  var picked = state.pages.filter(function(p){
    var el = cardEl(p.id);
    var h = el ? el.offsetHeight : CARD_H_EST_SELECT;
    return p.x < maxX && p.x + CARD_W > minX && p.y < maxY && p.y + h > minY;
  });
  state.selectedCardIds = new Set(picked.map(function(p){ return p.id; }));
  marqueeDrag = null;
  elMarqueeBox.style.display = 'none';
  renderAll();
}

/* ---- section dragging (whole-questline view): moves all of a quest's
   pages together ---- */
var sectionDrag = null;
document.getElementById('sections-layer').addEventListener('mousedown', function(e){
  var box = e.target.closest('.quest-section');
  if(!box) return;
  var qid = box.dataset.questId;
  var wp = toWorld(e.clientX, e.clientY);
  var pages = state.pages.filter(function(p){ return p._questId === qid; });
  sectionDrag = {
    questId: qid,
    startX: wp.x, startY: wp.y,
    pages: pages.map(function(p){ return {page: p, startX: p.x, startY: p.y}; })
  };
  box.classList.add('dragging');
  e.stopPropagation();
});

/* ---- card dragging ---- */
var cardDrag = null;
// Dragging a card in a lasso selection of 2+ cards moves the whole selection.
var groupDrag = null;
elCardsLayer.addEventListener('mousedown', function(e){
  var handle = e.target.closest('.handle');
  if(handle){
    var cardElRef = handle.closest('.card');
    startConnecting(cardElRef.dataset.id, handle.dataset.side);
    e.stopPropagation();
    return;
  }
  var header = e.target.closest('.card-header');
  if(header && !e.target.closest('.icon-btn')){
    var cEl = header.closest('.card');
    var page = pageById(cEl.dataset.id);
    var wp = toWorld(e.clientX, e.clientY);
    if(state.selectedCardIds.size > 1 && state.selectedCardIds.has(page.id)){
      groupDrag = {
        startX: wp.x, startY: wp.y,
        pages: Array.from(state.selectedCardIds).map(pageById).filter(Boolean)
          .map(function(p){ return {page: p, startX: p.x, startY: p.y}; })
      };
      groupDrag.pages.forEach(function(entry){
        var gEl = cardEl(entry.page.id);
        if(gEl) gEl.classList.add('dragging');
      });
      e.stopPropagation();
      return;
    }
    cardDrag = {id: page.id, offX: wp.x - page.x, offY: wp.y - page.y};
    cEl.classList.add('dragging');
    e.stopPropagation();
  }
});

document.addEventListener('mousemove', function(e){
  if(marqueeDrag){
    updateMarquee(e.clientX, e.clientY);
    return;
  }
  if(groupDrag){
    var gwp = toWorld(e.clientX, e.clientY);
    var gdx = gwp.x - groupDrag.startX;
    var gdy = gwp.y - groupDrag.startY;
    groupDrag.pages.forEach(function(entry){
      entry.page.x = entry.startX + gdx;
      entry.page.y = entry.startY + gdy;
      var gEl = cardEl(entry.page.id);
      if(gEl){ gEl.style.left = entry.page.x + 'px'; gEl.style.top = entry.page.y + 'px'; }
    });
    renderWires();
    if(state.activeQuestlineId) renderSections();
    return;
  }
  if(cardDrag){
    var page = pageById(cardDrag.id);
    var wp = toWorld(e.clientX, e.clientY);
    // Not clamped: negative x/y is allowed.
    page.x = wp.x - cardDrag.offX;
    page.y = wp.y - cardDrag.offY;
    var el = cardEl(page.id);
    el.style.left = page.x + 'px';
    el.style.top = page.y + 'px';
    renderWires();
    // keep the section box wrapped around a card dragged on its own
    if(state.activeQuestlineId) renderSections();
    return;
  }
  if(sectionDrag){
    var swp = toWorld(e.clientX, e.clientY);
    var dx = swp.x - sectionDrag.startX;
    var dy = swp.y - sectionDrag.startY;
    sectionDrag.pages.forEach(function(entry){
      entry.page.x = entry.startX + dx;
      entry.page.y = entry.startY + dy;
      var cEl = cardEl(entry.page.id);
      if(cEl){ cEl.style.left = entry.page.x + 'px'; cEl.style.top = entry.page.y + 'px'; }
    });
    renderWires();
    renderSections();
    // renderSections() rebuilds the boxes, so re-apply .dragging
    var draggingBox = document.querySelector('.quest-section[data-quest-id="' + sectionDrag.questId + '"]');
    if(draggingBox) draggingBox.classList.add('dragging');
    return;
  }
  if(connecting){
    updateTempWire(e.clientX, e.clientY);
  }
});

document.addEventListener('mouseup', function(e){
  if(marqueeDrag){
    finishMarquee(e.clientX, e.clientY);
  }
  if(groupDrag){
    groupDrag.pages.forEach(function(entry){
      var gEl = cardEl(entry.page.id);
      if(gEl) gEl.classList.remove('dragging');
    });
    groupDrag = null;
  }
  if(cardDrag){
    var el = cardEl(cardDrag.id);
    if(el) el.classList.remove('dragging');
    cardDrag = null;
  }
  if(sectionDrag){
    var box = document.querySelector('.quest-section[data-quest-id="' + sectionDrag.questId + '"]');
    if(box) box.classList.remove('dragging');
    sectionDrag = null;
  }
  if(connecting){
    // When cards overlap, e.target is often the source card. Use the full
    // hit stack so the drop can skip past it to the target underneath.
    var hitStack = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target];
    var handleTarget = null, targetCardEl = null;
    for(var hi = 0; hi < hitStack.length; hi++){
      var hEl = hitStack[hi].closest && hitStack[hi].closest('.handle');
      if(hEl){
        var hCard = hEl.closest('.card');
        if(hCard && hCard.dataset.id !== connecting.fromId){ handleTarget = hEl; targetCardEl = hCard; break; }
      }
    }
    if(!targetCardEl){
      for(var ci = 0; ci < hitStack.length; ci++){
        var cEl = hitStack[ci].closest && hitStack[ci].closest('.card');
        if(cEl && cEl.dataset.id !== connecting.fromId){ targetCardEl = cEl; break; }
      }
    }
    if(targetCardEl){
      var toId = targetCardEl.dataset.id;
      var toPage = pageById(toId);
      var fromPage = pageById(connecting.fromId);
      var dropWp = toWorld(e.clientX, e.clientY);
      var toSide = handleTarget ? handleTarget.dataset.side : nearestSide(toPage, dropWp.x, dropWp.y);
      // Directed: A->B and B->A are separate arrows (e.g. a submenu
      // returning to its menu). Only reject an exact repeat.
      var exists = state.connections.some(function(c){
        return c.from === connecting.fromId && c.to === toId;
      });
      // Pages from different quests (whole-questline view only): this is a
      // questline-level cross-quest arrow.
      var isCross = !!(fromPage._questId && toPage._questId && fromPage._questId !== toPage._questId);
      if(!exists){
        var newConn = {
          id: 'w' + (state.nextConnId++),
          from: connecting.fromId, to: toId,
          fromSide: connecting.fromSide, toSide: toSide
        };
        if(isCross) newConn._cross = true;
        state.connections.push(newConn);
        // Same-quest only (cross-quest labels come from import). Use the
        // only response, or ask which one when there are several.
        if(!isCross){
          var respChoices = responseChoicesForPage(fromPage);
          if(respChoices.length === 1){
            newConn.label = respChoices[0];
          } else if(respChoices.length > 1){
            showConnLabelChooser(newConn, respChoices, e.clientX, e.clientY);
          }
        }
      }
    }
    stopConnecting();
    renderWires();
  }
});

document.addEventListener('keydown', function(e){
  var tag = document.activeElement ? document.activeElement.tagName : '';
  if(tag === 'INPUT' || tag === 'TEXTAREA') return;
  if((e.key === 'Delete' || e.key === 'Backspace') && state.selectedConn){
    removeConnection(state.selectedConn);
  }
  if(e.key === 'Escape' && connecting){
    stopConnecting();
  }
  if(e.key === 'Escape'){
    closeConnLabelChooser();
  }
  if(e.key === 'Escape' && state.selectedCardIds.size){
    state.selectedCardIds.clear();
    renderAll();
  }
});
