import { pageById } from '../state/store.js';
import { elWires, elViewport } from '../dom.js';
import { anchorPoint, controlDir } from '../render/wires.js';
import { toWorld } from './pan-zoom.js';

/* ---- connection dragging ---- */
export var connecting = null;
export var elTempWire = null;

export function startConnecting(cardId, side){
  connecting = {fromId: cardId, fromSide: side};
  elTempWire = document.createElementNS('http://www.w3.org/2000/svg','path');
  elTempWire.setAttribute('class', 'wire-temp');
  elWires.appendChild(elTempWire);
  elViewport.classList.add('connecting');
}

export function stopConnecting(){
  if(elTempWire && elTempWire.parentNode) elTempWire.parentNode.removeChild(elTempWire);
  connecting = null;
  elTempWire = null;
  elViewport.classList.remove('connecting');
}

/* While dragging, the wire always leaves from the exact handle the user
   grabbed (fromSide is fixed at drag-start, never re-guessed). */
export function updateTempWire(clientX, clientY){
  if(!connecting) return;
  var from = pageById(connecting.fromId);
  var wp = toWorld(clientX, clientY);
  var p1 = anchorPoint(from, connecting.fromSide);
  var dir = controlDir(connecting.fromSide);
  var dx = Math.max(55, Math.hypot(wp.x - p1.x, wp.y - p1.y) * 0.5);
  var c1 = {x: p1.x + dir.x * dx, y: p1.y + dir.y * dx};
  var c2 = {x: (c1.x + wp.x) / 2, y: (c1.y + wp.y) / 2};
  var d = 'M ' + p1.x + ' ' + p1.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + wp.x + ' ' + wp.y;
  elTempWire.setAttribute('d', d);
}

/* When the drop isn't precisely on a handle (its hit area is small, and a
   neighboring card placed close by can sit on top of it), fall back to
   whichever side's anchor point — top, left, or right — the drop is
   actually nearest to, rather than only ever guessing left/right by which
   horizontal half of the card it landed in. That old left/right-only
   guess meant a drop aimed at the top handle but landed a few pixels off
   would silently connect to a side instead, with no feedback that
   anything other than "top" had happened. */
export function nearestSide(page, worldX, worldY){
  var top = anchorPoint(page, 'top');
  var left = anchorPoint(page, 'left');
  var right = anchorPoint(page, 'right');
  var dTop = Math.hypot(worldX - top.x, worldY - top.y);
  var dLeft = Math.hypot(worldX - left.x, worldY - left.y);
  var dRight = Math.hypot(worldX - right.x, worldY - right.y);
  if(dTop <= dLeft && dTop <= dRight) return 'top';
  return dLeft <= dRight ? 'left' : 'right';
}
