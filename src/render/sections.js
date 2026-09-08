import { state } from '../state/store.js';
import { cardEl, CARD_W } from './cards.js';

/* Visual-only section boxes for the whole-questline canvas view: one
   labeled, dashed rectangle per member quest, tightly wrapping that
   quest's cards. Recomputed from the live DOM on every render, so it
   stays accurate as cards move or resize — not draggable as a group
   (that's a later stage), purely a visual grouping aid for now. */
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
