import { state, pageById } from '../state/store.js';
import { elWires } from '../dom.js';
import { responseChoicesForPage } from '../utils/text.js';
import { scheduleAutosave } from '../state/persist.js';
import { cardEl, CARD_W } from './cards.js';
import { toClient } from '../canvas/pan-zoom.js';
import { READ_ONLY } from '../mode.js';

var BORDER_W = 1;

/* Anchors sit on the header edges, matching the .handle-* CSS. Header
   height is measured live because long names can wrap. */
export function anchorPoint(page, side){
  var headerEl = cardEl(page.id) ? cardEl(page.id).querySelector('.card-header') : null;
  var headerH = headerEl ? headerEl.offsetHeight : 56;
  if(side === 'top'){
    return {x: page.x + CARD_W / 2, y: page.y + BORDER_W};
  }
  if(side === 'right'){
    return {x: page.x + CARD_W - BORDER_W, y: page.y + BORDER_W + headerH / 2};
  }
  return {x: page.x + BORDER_W, y: page.y + BORDER_W + headerH / 2};
}

/* Control-point direction per side, so curves meet edges perpendicularly. */
export function controlDir(side){
  if(side === 'top') return {x: 0, y: -1};
  if(side === 'right') return {x: 1, y: 0};
  return {x: -1, y: 0};
}

export function bezierParts(fromPage, fromSide, toPage, toSide){
  var p1 = anchorPoint(fromPage, fromSide);
  var p2 = anchorPoint(toPage, toSide);
  var dx = Math.max(55, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.5);
  var d1 = controlDir(fromSide), d2 = controlDir(toSide);
  var c1 = {x: p1.x + d1.x * dx, y: p1.y + d1.y * dx};
  var c2 = {x: p2.x + d2.x * dx, y: p2.y + d2.y * dx};
  return {p1: p1, c1: c1, c2: c2, p2: p2};
}

export function pathFor(fromPage, fromSide, toPage, toSide){
  var b = bezierParts(fromPage, fromSide, toPage, toSide);
  return 'M ' + b.p1.x + ' ' + b.p1.y +
    ' C ' + b.c1.x + ' ' + b.c1.y + ', ' + b.c2.x + ' ' + b.c2.y + ', ' + b.p2.x + ' ' + b.p2.y;
}

export function bezierPointAt(b, t){
  var mt = 1 - t;
  return {
    x: mt*mt*mt*b.p1.x + 3*mt*mt*t*b.c1.x + 3*mt*t*t*b.c2.x + t*t*t*b.p2.x,
    y: mt*mt*mt*b.p1.y + 3*mt*mt*t*b.c1.y + 3*mt*t*t*b.c2.y + t*t*t*b.p2.y
  };
}

// For A->B / B->A pairs, flags the later one in array order as the "return"
// arrow, which renderWires draws grey.
export function computeMutualReturnIds(connections){
  var returnIds = {};
  connections.forEach(function(a, i){
    if(returnIds[a.id]) return;
    for(var j = i + 1; j < connections.length; j++){
      var b = connections[j];
      if(!returnIds[b.id] && b.from === a.to && b.to === a.from){
        returnIds[b.id] = true;
        break;
      }
    }
  });
  return returnIds;
}

export function renderWires(){
  // Use .children, not .childNodes: a whitespace text node before <defs>
  // would make this loop delete the arrowhead markers.
  while(elWires.children.length > 1){
    elWires.removeChild(elWires.lastElementChild);
  }
  var returnIds = computeMutualReturnIds(state.connections);
  state.connections.forEach(function(conn){
    var from = pageById(conn.from), to = pageById(conn.to);
    if(!from || !to) return;
    var d = pathFor(from, conn.fromSide, to, conn.toSide);

    var hit = document.createElementNS('http://www.w3.org/2000/svg','path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'wire-hit');
    hit.dataset.conn = conn.id;
    hit.style.pointerEvents = 'stroke';
    // Read-only: no selection, but keep the hit path for its tooltip.
    if(!READ_ONLY){
      hit.addEventListener('click', function(e){
        e.stopPropagation();
        state.selectedConn = state.selectedConn === conn.id ? null : conn.id;
        renderWires();
      });
    }
    // Full label (response text or cross-quest requirement) as a tooltip,
    // since the on-canvas label is truncated.
    if(conn.label){
      var titleEl = document.createElementNS('http://www.w3.org/2000/svg','title');
      titleEl.textContent = conn.label;
      hit.appendChild(titleEl);
    }
    elWires.appendChild(hit);

    var visible = document.createElementNS('http://www.w3.org/2000/svg','path');
    visible.setAttribute('d', d);
    var isReturn = !!returnIds[conn.id];
    visible.setAttribute('class', 'wire' + (conn._cross ? ' wire-cross' : '') + (isReturn ? ' wire-return' : '') + (state.selectedConn === conn.id ? ' selected' : ''));
    visible.setAttribute('marker-end', isReturn ? 'url(#arrowhead-return)' : 'url(#arrowhead)');
    elWires.appendChild(visible);

    // Label at t=0.35 to stay clear of the delete control at t=0.5. Hidden
    // on same-quest arrows whose source page currently has one response.
    var showWireLabel = conn.label && (conn._cross || responseChoicesForPage(from).length > 1);
    if(showWireLabel){
      var labelPt = bezierPointAt(bezierParts(from, conn.fromSide, to, conn.toSide), 0.35);
      var shortLabel = conn.label.length > 26 ? conn.label.slice(0, 25) + '…' : conn.label;
      var lg = document.createElementNS('http://www.w3.org/2000/svg','g');
      lg.setAttribute('class', 'wire-label' + (conn._cross ? ' cross' : ''));
      lg.setAttribute('transform', 'translate(' + labelPt.x + ',' + labelPt.y + ')');
      var lw = Math.max(20, shortLabel.length * 5.6 + 10);
      var lr = document.createElementNS('http://www.w3.org/2000/svg','rect');
      lr.setAttribute('x', -lw / 2);
      lr.setAttribute('y', -9);
      lr.setAttribute('width', lw);
      lr.setAttribute('height', 18);
      lr.setAttribute('rx', 4);
      var lt = document.createElementNS('http://www.w3.org/2000/svg','text');
      lt.textContent = shortLabel;
      lg.appendChild(lr);
      lg.appendChild(lt);
      elWires.appendChild(lg);
    }

    if(state.selectedConn === conn.id){
      var mid = bezierPointAt(bezierParts(from, conn.fromSide, to, conn.toSide), 0.5);
      var g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('class', 'wire-del');
      g.setAttribute('transform', 'translate(' + mid.x + ',' + mid.y + ')');
      var c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('r', '10');
      var t = document.createElementNS('http://www.w3.org/2000/svg','text');
      t.textContent = '×';
      g.appendChild(c); g.appendChild(t);
      g.addEventListener('click', function(e){
        e.stopPropagation();
        removeConnection(conn.id);
      });
      elWires.appendChild(g);

      // Label button, only if the source page has responses.
      var labelChoices = responseChoicesForPage(from);
      if(labelChoices.length){
        var tg = document.createElementNS('http://www.w3.org/2000/svg','g');
        tg.setAttribute('class', 'wire-del wire-tag');
        tg.setAttribute('transform', 'translate(' + (mid.x - 26) + ',' + mid.y + ')');
        var tc = document.createElementNS('http://www.w3.org/2000/svg','circle');
        tc.setAttribute('r', '10');
        var tt = document.createElementNS('http://www.w3.org/2000/svg','text');
        tt.textContent = '✎';
        tg.appendChild(tc); tg.appendChild(tt);
        tg.addEventListener('click', function(e){
          e.stopPropagation();
          var pt = toClient(mid.x - 26, mid.y + 20);
          showConnLabelChooser(conn, labelChoices, pt.x, pt.y);
        });
        elWires.appendChild(tg);
      }
    }
  });
  scheduleAutosave();
}

export function removeConnection(id){
  state.connections = state.connections.filter(function(c){return c.id !== id;});
  state.selectedConn = null;
  renderWires();
}

/* Floating chooser for picking a wire's label from its source page's
   responses. Opened after drawing a connection and from a selected wire's
   label button. */
export function closeConnLabelChooser(){
  var existing = document.getElementById('conn-label-chooser');
  if(existing) existing.remove();
}

export function showConnLabelChooser(conn, choices, clientX, clientY){
  closeConnLabelChooser();
  var box = document.createElement('div');
  box.id = 'conn-label-chooser';
  box.className = 'conn-label-chooser';
  box.style.left = clientX + 'px';
  box.style.top = clientY + 'px';

  var head = document.createElement('div');
  head.className = 'clc-head';
  head.textContent = 'Which response leads here?';
  box.appendChild(head);

  choices.forEach(function(text){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      conn.label = text;
      closeConnLabelChooser();
      renderWires();
    });
    box.appendChild(btn);
  });

  if(conn.label){
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'clc-skip';
    clear.textContent = 'Clear label';
    clear.addEventListener('click', function(e){
      e.stopPropagation();
      delete conn.label;
      closeConnLabelChooser();
      renderWires();
    });
    box.appendChild(clear);
  } else {
    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'clc-skip';
    skip.textContent = 'No label';
    skip.addEventListener('click', function(e){
      e.stopPropagation();
      closeConnLabelChooser();
    });
    box.appendChild(skip);
  }

  document.body.appendChild(box);
  // clamp on-screen after layout, so it doesn't spill past the right/bottom edge
  var r = box.getBoundingClientRect();
  if(r.right > window.innerWidth) box.style.left = Math.max(4, window.innerWidth - r.width - 8) + 'px';
  if(r.bottom > window.innerHeight) box.style.top = Math.max(4, window.innerHeight - r.height - 8) + 'px';

  setTimeout(function(){
    document.addEventListener('mousedown', function dismiss(e){
      if(box.contains(e.target)) return;
      closeConnLabelChooser();
      document.removeEventListener('mousedown', dismiss);
    });
  }, 0);
}
