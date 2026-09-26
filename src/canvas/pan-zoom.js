import { state } from '../state/store.js';
import { elWorld, elZoomPct, elViewport } from '../dom.js';
import { scheduleAutosave } from '../state/persist.js';
import { READ_ONLY } from '../mode.js';

/* ================= pan & zoom ================= */
export function applyTransform(){
  elWorld.style.transform = 'translate(' + state.pan.x + 'px,' + state.pan.y + 'px) scale(' + state.zoom + ')';
  elZoomPct.textContent = Math.round(state.zoom * 100) + '%';
  scheduleAutosave();
}

export function toWorld(clientX, clientY){
  var rect = elViewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.pan.x) / state.zoom,
    y: (clientY - rect.top - state.pan.y) / state.zoom
  };
}

/* Inverse of toWorld — used to place the HTML response-label chooser over
   a world-space point (a wire's midpoint) rather than a raw mouse event. */
export function toClient(worldX, worldY){
  var rect = elViewport.getBoundingClientRect();
  return {
    x: rect.left + state.pan.x + worldX * state.zoom,
    y: rect.top + state.pan.y + worldY * state.zoom
  };
}

export function setZoom(newZoom, aroundClientX, aroundClientY){
  // Floor is 5% rather than something closer to 35-50% specifically so a
  // very large board can be zoomed out far enough to spot a stray card or
  // section that's drifted way off from the rest.
  newZoom = Math.max(0.05, Math.min(2, newZoom));
  if(aroundClientX !== undefined){
    var before = toWorld(aroundClientX, aroundClientY);
    state.zoom = newZoom;
    var rect = elViewport.getBoundingClientRect();
    state.pan.x = (aroundClientX - rect.left) - before.x * state.zoom;
    state.pan.y = (aroundClientY - rect.top) - before.y * state.zoom;
  } else {
    state.zoom = newZoom;
  }
  applyTransform();
}

document.getElementById('zoom-in').addEventListener('click', function(){
  var r = elViewport.getBoundingClientRect();
  setZoom(state.zoom * 1.18, r.left + r.width/2, r.top + r.height/2);
});
document.getElementById('zoom-out').addEventListener('click', function(){
  var r = elViewport.getBoundingClientRect();
  setZoom(state.zoom / 1.18, r.left + r.width/2, r.top + r.height/2);
});
elZoomPct.addEventListener('click', function(){
  var r = elViewport.getBoundingClientRect();
  setZoom(1, r.left + r.width/2, r.top + r.height/2);
});

elViewport.addEventListener('wheel', function(e){
  if(!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  var factor = e.deltaY < 0 ? 1.08 : 1/1.08;
  setZoom(state.zoom * factor, e.clientX, e.clientY);
}, {passive:false});

/* ---- panning on empty canvas ----
   Shared by the editor and the read-only viewer. The editor's extra
   empty-canvas behavior (shift-drag lasso, deselecting) is in drag.js. */

// .wire-del covers both the x delete button and the pencil edit button
// on a selected wire. Without this exclusion, a mousedown on either one
// bubbled up to the viewport first (before the button's own 'click'
// handler could fire), deselected the connection, and re-rendered the
// wires layer — which deletes the button element itself. The click event
// then had nothing left to fire on, so the buttons looked dead despite
// being visible and having working click listeners.
export function isPanExcludedTarget(target){
  return !!(target.closest('.card') || target.closest('.handle') || target.closest('#zoom-ctl') ||
    target.closest('.quest-section') || target.closest('.wire-del'));
}

var panDrag = null;
elViewport.addEventListener('mousedown', function(e){
  // In the viewer, cards and section boxes can't be dragged, so a drag
  // starting on a card header or a section box pans the canvas instead of
  // doing nothing. A card's body is left alone so its text stays selectable.
  if(READ_ONLY){
    if(e.target.closest('.card-body') || e.target.closest('button') || e.target.closest('#zoom-ctl') || e.target.closest('#linked-items-toggle')) return;
  } else {
    if(isPanExcludedTarget(e.target) || e.shiftKey) return;
  }
  panDrag = {startX: e.clientX, startY: e.clientY, panX: state.pan.x, panY: state.pan.y};
  elViewport.classList.add('panning');
});
document.addEventListener('mousemove', function(e){
  if(!panDrag) return;
  state.pan.x = panDrag.panX + (e.clientX - panDrag.startX);
  state.pan.y = panDrag.panY + (e.clientY - panDrag.startY);
  applyTransform();
});
document.addEventListener('mouseup', function(){
  if(!panDrag) return;
  panDrag = null;
  elViewport.classList.remove('panning');
});
