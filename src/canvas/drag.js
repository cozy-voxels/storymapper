import { state, pageById } from '../state/store.js';
import { elViewport, elMarqueeBox, elCardsLayer } from '../dom.js';
import { toWorld, applyTransform } from './pan-zoom.js';
import { cardEl, CARD_W, renderAll } from '../render/cards.js';
import { renderWires, removeConnection, closeConnLabelChooser, showConnLabelChooser } from '../render/wires.js';
import { renderSections } from '../render/sections.js';
import { connecting, startConnecting, stopConnecting, updateTempWire, nearestSide } from './connect.js';
import { responseChoicesForPage } from '../utils/text.js';

/* ---- panning on empty canvas ---- */
var panDrag = null;
elViewport.addEventListener('mousedown', function(e){
  // .wire-del covers both the x delete button and the pencil edit button
  // on a selected wire. Without this exclusion, a mousedown on either one
  // bubbled up here first (before the button's own 'click' handler could
  // fire), deselected the connection, and re-rendered the wires layer —
  // which deletes the button element itself. The click event then had
  // nothing left to fire on, so the buttons looked dead despite being
  // visible and having working click listeners.
  if(e.target.closest('.card') || e.target.closest('.handle') || e.target.closest('#zoom-ctl') || e.target.closest('.quest-section') || e.target.closest('.wire-del')) return;
  // Shift-drag on empty canvas: draw a lasso instead of panning, to select
  // several cards for a temporary group move (see startMarquee below).
  if(e.shiftKey){
    startMarquee(e.clientX, e.clientY);
    return;
  }
  panDrag = {startX: e.clientX, startY: e.clientY, panX: state.pan.x, panY: state.pan.y};
  elViewport.classList.add('panning');
  if(state.selectedConn){ state.selectedConn = null; renderWires(); }
  // A plain click on empty canvas drops the temp group too, same as
  // clicking away from anything else selected on the canvas.
  if(state.selectedCardIds.size){ state.selectedCardIds.clear(); renderAll(); }
});

/* ---- lasso (shift-drag) multi-select: a temporary "group" for moving
   several cards at once. Unlike a Questline, this selection is pure UI
   state — never written to the store, and cleared on every quest switch,
   Escape, or a plain click on empty canvas. ---- */
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
// Estimated card height, same reasoning as fitViewToPages: actual height
// is content-dependent and only known post-render, so this is approximate
// — good enough for "does the lasso overlap this card", not pixel-perfect.
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

/* ---- section dragging (whole-questline view: drag a quest's section
   box to move every one of that quest's pages together, keeping their
   positions relative to each other — full container behavior, not just
   the label) ---- */
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
// Dragging a card that's part of an active lasso selection (2+ cards)
// moves the whole temp group together, keeping their relative positions —
// same idea as sectionDrag above, but for an ad-hoc selection rather than
// a whole Questline's pages.
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
  if(panDrag){
    state.pan.x = panDrag.panX + (e.clientX - panDrag.startX);
    state.pan.y = panDrag.panY + (e.clientY - panDrag.startY);
    applyTransform();
    return;
  }
  if(cardDrag){
    var page = pageById(cardDrag.id);
    var wp = toWorld(e.clientX, e.clientY);
    // No lower bound: a card can be dragged to any x/y, including
    // negative — clamping to 0 here used to make the canvas origin feel
    // like a wall nothing could be pushed past.
    page.x = wp.x - cardDrag.offX;
    page.y = wp.y - cardDrag.offY;
    var el = cardEl(page.id);
    el.style.left = page.x + 'px';
    el.style.top = page.y + 'px';
    renderWires();
    // keep a page's section box tightly wrapped even when it's dragged
    // on its own (not as part of a whole-section drag)
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
    // renderSections() rebuilds the boxes from scratch, so re-apply the
    // "actively dragging" cursor state to the one the user is holding
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
  if(panDrag){
    panDrag = null;
    elViewport.classList.remove('panning');
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
    // e.target alone is whatever the browser's normal hit-test resolves
    // to — which, when two cards are placed close together (exactly the
    // arrangement someone reaches for when they want a tight top-to-top
    // connection), is very often the card being dragged FROM: it and the
    // target can end up overlapping by a few pixels, and since both share
    // the same z-index, DOM order decides the winner regardless of which
    // one actually makes sense here. elementsFromPoint returns the whole
    // stack at that point, so this can skip straight past the source card
    // (and past anything else in the way) to the target underneath,
    // rather than the drop silently doing nothing because the wrong card
    // happened to be on top.
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
      // Directed, not undirected: a submenu page that leads back to the
      // page that opened it (very common — "Got it." returning to a menu)
      // is two separate, legitimate arrows, one each way. This used to
      // treat A->B and B->A as the same connection, so once one direction
      // existed, drawing the other direction silently did nothing — no
      // error, the drag just ended with no new arrow, no matter which
      // side you dropped on, since it never got far enough to look at
      // sides at all. Only reject an exact repeat of the same direction.
      var exists = state.connections.some(function(c){
        return c.from === connecting.fromId && c.to === toId;
      });
      // A connection between pages tagged with different source quests
      // (only possible in a whole-questline view) is questline-level data,
      // not part of either quest's own dialog flow — flag it as such.
      var isCross = !!(fromPage._questId && toPage._questId && fromPage._questId !== toPage._questId);
      if(!exists){
        var newConn = {
          id: 'w' + (state.nextConnId++),
          from: connecting.fromId, to: toId,
          fromSide: connecting.fromSide, toSide: toSide
        };
        if(isCross) newConn._cross = true;
        state.connections.push(newConn);
        // Cross-quest arrows get their label from a quest-state gate on
        // import, not from response text, so this only applies same-quest.
        // One response: no real choice to make, so just use it. More than
        // one: ask, since which response this particular arrow represents
        // isn't otherwise obvious once several exit the same card.
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
