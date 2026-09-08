/* ================= text formatting helpers ================= */
export function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Matches only the known style/color tags — {b} {i} {m} {/} and a 6-digit
// {#hexcolor} — never a variable placeholder like {username},
// {variable:max_arena2_bribe}, or {string:daily_harvesting_target}, which
// all fail this pattern and pass through untouched.
var STYLE_TAG_RE = /\{(#[0-9a-fA-F]{6}|\/|b|i|m)\}/g;

export function formatInline(raw){
  if(!raw) return '';
  var parts = raw.split(/(<br\s*\/?>)/i);
  var out = parts.map(function(part){
    if(/^<br\s*\/?>$/i.test(part)) return '<br>';
    var t = escapeHtml(part);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Card view only: drop the {b}/{i}/{m}/{/}/{#hex} style tags so the
    // text reads clean, same as the card title. Real variables (anything
    // else in braces) stay in place. The edit modal's textareas read
    // field.value directly, never through here, so raw tags are still
    // there to view and edit in full.
    t = t.replace(STYLE_TAG_RE, '');
    return t;
  });
  return out.join('').trim();
}

/* Card title only: strips {#hexcolor}/{b}/{/} style markup tags entirely
   rather than showing them as {tbd} pills, so the NPC name reads clean at
   a glance on the canvas. The edit modal's "NPC name" input reads page.title
   directly (never through this), so the raw markup is still there to view
   and edit in full. */
export function formatCardTitle(raw){
  if(!raw) return '';
  return escapeHtml(raw).replace(/\{[^}]+\}/g, '').trim();
}

export function splitLines(raw){
  return raw.split(/<br\s*\/?>/i).map(function(l){return l.trim();}).filter(function(l){return l.length;});
}

/* Top-level response lines from a page's own Response(s) field (the "— "
   sub-lines under each one are actions/requirements, not choices) — used
   to offer response text as a connection label while hand-drawing a wire,
   the same way JSON import derives it from each Response's Text. */
export function responseChoicesForPage(page){
  var field = (page.fields || []).filter(function(f){ return f.key === 'Response(s)'; })[0];
  if(!field) return [];
  return splitLines(field.value)
    .filter(function(l){ return !/^—/.test(l); })
    .map(function(l){ return l.replace(/^-\s*/, '').trim(); })
    .filter(Boolean);
}

export function renderBulletField(raw, tone){
  var lines = splitLines(raw);
  if(!lines.length) return '';
  var html = '<ul class="bullet-list tone-' + tone + '">';
  var openSub = false;
  lines.forEach(function(line){
    var isSub = /^—/.test(line);
    if(isSub){
      var subText = line.replace(/^—\s*/, '');
      if(!openSub){ html += '<ul class="bullet-sub">'; openSub = true; }
      html += '<li>' + formatInline(subText) + '</li>';
    } else {
      if(openSub){ html += '</ul>'; openSub = false; }
      var topText = line.replace(/^-\s*/, '');
      var isLabel = /:$/.test(topText) && !/^-/.test(line);
      html += '<li class="' + (isLabel ? 'label-line' : '') + '">' + formatInline(topText) + '</li>';
    }
  });
  if(openSub) html += '</ul>';
  html += '</ul>';
  return html;
}

export function looksLikeBulletField(raw){
  return /(^|<br\s*\/?>)\s*[-—]/i.test(raw);
}

export function renderSimpleList(items, tone){
  if(!items || !items.length) return '';
  var html = '<ul class="bullet-list tone-' + tone + '">';
  items.forEach(function(line){
    html += '<li>' + formatInline(line) + '</li>';
  });
  html += '</ul>';
  return html;
}

/* Splits a combined Note(s) cell into the discrete PageData fields it
   actually represents per ql_data-models.md: Requirements, Objectives,
   LoadActions. Anything left over (bare condition lines, "Npc req", etc.)
   falls back to Requirements, since that's what the "Requirement(s):"
   header in these notes has always meant. */
export function classifyNoteLines(raw){
  var lines = splitLines(raw);
  var reqs = [], objs = [], loads = [];
  lines.forEach(function(line){
    var stripped = line.replace(/^[-—]\s*/, '').trim();
    if(!stripped) return;
    if(/^requirement\(s\)\s*:?\s*$/i.test(stripped)) return;
    var mObj = stripped.match(/^objective\(s\)\s*:\s*(.*)$/i);
    if(mObj){ if(mObj[1].trim()) objs.push(mObj[1].trim()); return; }
    var mLoad = stripped.match(/^load\s*action\s*:\s*(.*)$/i);
    if(mLoad){ if(mLoad[1].trim()) loads.push(mLoad[1].trim()); return; }
    reqs.push(stripped);
  });
  return {reqs: reqs, objs: objs, loads: loads};
}

export function expandNoteFields(fields){
  var out = [];
  fields.forEach(function(f){
    var keyLower = f.key.toLowerCase();
    if(keyLower === 'note(s)' || keyLower === 'notes'){
      var c = classifyNoteLines(f.value);
      if(c.reqs.length) out.push({key: 'Requirements', value: c.reqs.join(' <br> ')});
      if(c.objs.length) out.push({key: 'Objectives', value: c.objs.join(' <br> ')});
      if(c.loads.length) out.push({key: 'LoadActions', value: c.loads.join(' <br> ')});
      return;
    }
    out.push(f);
  });
  return out;
}
