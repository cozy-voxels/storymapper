import { state } from '../state/store.js';
import { cardEl, CARD_W } from './cards.js';

/* Whole-questline view: one labeled box per member quest, sized from the
   live DOM on every render. Dragging is handled in drag.js. */
export function renderSections(){
  var elSections = document.getElementById('sections-layer');
  if(!elSections) return;
  elSections.innerHTML = '';
  if(!state.activeQuestlineId) return;
  var byQuest = {};
  state.pages.forEach(function(p){
    if(!p._questId) return;
    if(!byQuest[p._questId]) byQuest[p._questId] = [];
    byQuest[p._questId].push(p);
  });
  var PAD = 34, LABEL_H = 30;
  state.questlineMembers.forEach(function(m){
    var pages = byQuest[m.questId];
    if(!pages || !pages.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pages.forEach(function(p){
      var el = cardEl(p.id);
      var w = el ? el.offsetWidth : CARD_W;
      var h = el ? el.offsetHeight : 220;
      if(p.x < minX) minX = p.x;
      if(p.y < minY) minY = p.y;
      if(p.x + w > maxX) maxX = p.x + w;
      if(p.y + h > maxY) maxY = p.y + h;
    });
    var box = document.createElement('div');
    box.className = 'quest-section';
    box.dataset.questId = m.questId;
    box.style.left = (minX - PAD) + 'px';
    box.style.top = (minY - PAD - LABEL_H) + 'px';
    box.style.width = (maxX - minX + PAD * 2) + 'px';
    box.style.height = (maxY - minY + PAD * 2 + LABEL_H) + 'px';
    var label = document.createElement('div');
    label.className = 'quest-section-label';
    label.textContent = m.name;
    box.appendChild(label);
    elSections.appendChild(box);
  });
}
