import { state } from '../state/store.js';
import { expandNoteFields, normalizeBr } from '../utils/text.js';

/* ================= markdown parsing ================= */
export function parseMarkdownTables(md){
  var lines = md.split('\n');
  var blocks = [];
  var current = null;
  lines.forEach(function(line){
    var trimmed = line.trim();
    if(trimmed.indexOf('|') === 0 || (trimmed.indexOf('|') > -1 && trimmed.lastIndexOf('|') === trimmed.length - 1)){
      if(!current){ current = []; }
      current.push(trimmed);
    } else {
      if(current && current.length){ blocks.push(current); }
      current = null;
    }
  });
  if(current && current.length) blocks.push(current);

  var tables = [];
  blocks.forEach(function(block){
    var rows = [];
    block.forEach(function(line){
      var cells = line.split('|');
      if(cells.length && cells[0].trim() === '') cells.shift();
      if(cells.length && cells[cells.length-1].trim() === '') cells.pop();
      cells = cells.map(function(c){return c.trim();});
      var isSeparator = cells.every(function(c){return /^:?-+:?$/.test(c);});
      if(isSeparator) return;
      if(cells.length >= 2){
        rows.push([cells[0], cells.slice(1).join(' | ')]);
      }
    });
    if(rows.length) tables.push(rows);
  });
  return tables;
}

export function tablesToPages(tables){
  return tables.map(function(rows){
    var title = '', pageId = '', fields = [];
    rows.forEach(function(pair){
      var key = pair[0], val = pair[1];
      var keyLower = key.toLowerCase();
      if(keyLower === 'npc name' && !title){ title = val; return; }
      if(keyLower === 'page id' && !pageId){ pageId = val; return; }
      fields.push({key: key, value: normalizeBr(val)});
    });
    return {
      id: 'p' + (state.nextPageId++),
      title: title || 'Unnamed NPC',
      pageId: pageId || '—',
      fields: expandNoteFields(fields),
      x: 0, y: 0
    };
  });
}

export function layoutPages(pages){
  var cols = 4, colGap = 380, rowGap = 340, startX = 40, startY = 30;
  pages.forEach(function(page, i){
    var row = Math.floor(i / cols);
    var colInRow = i % cols;
    var col = (row % 2 === 0) ? colInRow : (cols - 1 - colInRow);
    page.x = startX + col * colGap;
    page.y = startY + row * rowGap;
  });
}
