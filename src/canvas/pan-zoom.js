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

/* Inverse of toWorld. */
export function toClient(worldX, worldY){
  var rect = elViewport.getBoundingClientRect();
  return {
    x: rect.left + state.pan.x + worldX * state.zoom,
    y: rect.top + state.pan.y + worldY * state.zoom
  };
}

export function setZoom(newZoom, aroundClientX, aroundClientY){
  // 5% minimum so large boards can be zoomed out far enough to find strays.
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
   Shared with the read-only viewer. Editor extras are in drag.js. */

// Skip .wire-del (delete/edit buttons on a selected wire): otherwise this
// mousedown deselects and re-renders the wires, removing the button
// before its click handler fires.
export function isPanExcludedTarget(target){
  return !!(target.closest('.card') || target.closest('.handle') || target.closest('#zoom-ctl') ||
    target.closest('.quest-section') || target.closest('.wire-del'));
}

var panDrag = null;
elViewport.addEventListener('mousedown', function(e){
  // Viewer: dragging a card header or section box pans. Card bodies are
  // skipped so text stays selectable.
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
