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

/* The wire leaves from the handle grabbed at drag start. */
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

/* For drops not on a handle: the side (top, left or right) whose anchor
   is nearest the drop point. */
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
