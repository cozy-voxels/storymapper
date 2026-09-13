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
    // else in braces) stay in place. The edit modal's textareas show real
    // line breaks (via brToText()) but keep everything else raw, so style
    // tags are still there to view and edit in full.
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

/* Splits on <br> variants AND real line breaks -- hand-typed field values
   (anything entered directly into a modal textarea, never round-tripped
   through JSON import's jsonLinesToBr()) often mix literal Enter-key
   newlines in with <br> tags, and every caller here treats each line as a
   discrete bullet/requirement/response item, so a raw \n has to split just
   like <br> does or two real items silently merge into one. */
export function splitLines(raw){
  return raw.split(/<br\s*\/?>|\r\n|\r|\n/i).map(function(l){return l.trim();}).filter(function(l){return l.length;});
}

/* A <textarea> shows whatever's in its .value literally -- it never
   interprets HTML, so a field stored with the app's "<br>"-joined
   convention shows the literal text "<br>" instead of a line break while
   editing. brToText()/textToBr() are the display-only round trip: convert
   to real line breaks when populating a textarea, convert back when
   reading it out for save, so storage/export never changes shape but
   editing shows clean multi-line text. Unlike splitLines(), these don't
   trim or drop blank lines -- a blank line matters here (it's how a
   paragraph break like "<br>  <br>" stays a paragraph break). */
export function brToText(raw){
  if(!raw) return '';
  return raw.replace(/<br\s*\/?>/gi, '\n');
}

export function textToBr(text){
  if(!text) return '';
  return text.replace(/\r\n|\r|\n/g, ' <br> ');
}

/* Top-level response lines from a page's own Response(s) field (the "— "
   sub-lines under each one are actions/requirements, not choices) — used
   to offer response text as a connection label while hand-drawing a wire,
   the same way JSON import derives it from each Response's Text. */
export function responseChoicesForPage(page){
  var field = (page.fields || []).filter(function(f){ return f.key === 'Response(s)'; })[0];
  if(!field) return [];
  return parseResponses(field.value).map(function(r){ return r.text; }).filter(Boolean);
}

/* A line starting with a single ASCII hyphen ("- ") always starts a new
   response -- never an em-dash ("—", U+2014) and never a bare label line
   like "Action(s):", both of which are sub-content of the response above.
   A bare line with neither prefix ALSO starts a new response, but only
   when nothing is open yet: some hand-typed pages skip the dash entirely
   when there's just one response choice to show, so the very first line
   of the field is a plain sentence with no leading "- " at all. Once a
   response is open, a bare line is content for it (or its labeled
   section), not a second response -- see parseResponses(). */
function isResponseStart(line, hasCurrent){
  if(/^-/.test(line)) return true;
  return !hasCurrent && !/^—/.test(line) && !sectionLabel(line);
}

/* Recognizes a "Requirement(s):"/"Action(s):" label -- singular or plural,
   with or without the parens, with or without a trailing colon -- whether
   it leads its own bare line (hand-typed convention) or trails a "— "
   sub-line dash. Returns the section it names plus whatever text follows
   the label on the same line, or null if the line isn't a label at all. */
var SECTION_LABEL_RE = /^(requirement|action)(s|\(s\))?\s*:?\s*/i;
function sectionLabel(text){
  var m = SECTION_LABEL_RE.exec(text);
  if(!m) return null;
  return {section: m[1].toLowerCase() === 'requirement' ? 'requirements' : 'actions', rest: text.slice(m[0].length).trim()};
}

/* Parses a Response(s) field's flat blob into structured
   {text, requirements[], actions[]} objects. This is the real QuestLines
   Response shape (Text/Requirements/Actions), flattened into one string
   for storage in page.fields -- see serializeResponses() for the inverse.

   Real hand-typed data (as opposed to serializeResponses()'s own clean
   "- text <br> — requires: X <br> — action" output) is looser than that
   one convention in two ways: (1) a page with only one response choice
   sometimes skips the leading "- " entirely, since there's nothing to
   enumerate -- see isResponseStart(); (2) a "Requirement(s):"/"Action(s):"
   label can lead a bare line of its own, with the actual items following
   on their own (possibly "— "-prefixed, possibly bare) lines below it
   until the next response or label -- so a section, once labeled, stays
   active for whatever un-labeled lines follow. Only the narrower
   "— requires: X" form (no active section yet) falls back to the
   original per-line sniff,
   for round-tripping serializeResponses()'s own machine-generated output. */
export function parseResponses(raw){
  if(!raw) return [];
  var responses = [];
  var current = null;
  var currentSection = null;
  splitLines(raw).forEach(function(line){
    if(isResponseStart(line, !!current)){
      current = {text: line.replace(/^[-—]\s*/, ''), requirements: [], actions: []};
      responses.push(current);
      currentSection = null;
      return;
    }
    if(!current) return; // a stray sub-line with no preceding "- " choice; nothing to attach it to
    var content = line.replace(/^—\s*/, '');
    var label = sectionLabel(content);
    if(label){
      currentSection = label.section;
      if(label.rest) current[currentSection].push(label.rest);
      return;
    }
    if(currentSection){
      current[currentSection].push(content);
      return;
    }
    var reqMatch = /^requires:\s*(.*)$/i.exec(content);
    if(reqMatch) current.requirements.push(reqMatch[1]);
    else current.actions.push(content);
  });
  return responses;
}

/* Inverse of parseResponses(): flattens structured response objects back
   into the "- text <br> — requires: X <br> — action" blob stored in
   page.fields. Drops any response with no text and no requirements/actions. */
export function serializeResponses(responses){
  var lines = [];
  (responses || []).forEach(function(r){
    var text = (r.text || '').trim();
    var reqs = (r.requirements || []).filter(function(x){ return x.trim(); });
    var actions = (r.actions || []).filter(function(x){ return x.trim(); });
    if(!text && !reqs.length && !actions.length) return;
    lines.push('- ' + text);
    reqs.forEach(function(rq){ lines.push('— requires: ' + rq); });
    actions.forEach(function(a){ lines.push('— ' + a); });
  });
  return lines.join(' <br> ');
}

/* Normalizes any <br>/<br/>/<BR> variant (regardless of surrounding
   whitespace) to the canonical ' <br> ' token -- the same spacing
   convention JSON import produces via jsonLinesToBr(). Markdown table cells
   can't contain real newlines, so a hand-authored line break is always a
   literal <br> tag typed into the cell; this keeps that tag readable as a
   real line break to splitLines/parseResponses/renderBulletField alike. */
export function normalizeBr(raw){
  if(!raw) return raw;
  return raw.replace(/\s*<br\s*\/?>\s*/gi, ' <br> ');
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

/* Card display for a Response(s) field: one top-level bullet per response
   choice, with a labeled "Requires:"/"Actions:" sub-list only when that
   response actually has one -- mirrors the real QuestLines Response shape
   (Text/Requirements/Actions) instead of the generic dash/em-dash bullet
   nesting renderBulletField produces for other fields. */
export function renderResponses(responses){
  if(!responses || !responses.length) return '';
  var html = '<ul class="bullet-list tone-response">';
  responses.forEach(function(r){
    html += '<li>' + formatInline(r.text) + '</li>';
    if(r.requirements.length || r.actions.length){
      html += '<ul class="bullet-sub">';
      if(r.requirements.length){
        html += '<li class="label-line">Requires:</li>';
        r.requirements.forEach(function(rq){ html += '<li>' + formatInline(rq) + '</li>'; });
      }
      if(r.actions.length){
        html += '<li class="label-line">Actions:</li>';
        r.actions.forEach(function(a){ html += '<li>' + formatInline(a) + '</li>'; });
      }
      html += '</ul>';
    }
  });
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

/* Case-insensitive alphabetical compare, used everywhere a list of world
   items or quests is ordered by display name (World directory rows, search
   results, linked-item lists, the Story-side linked-items panel). */
export function compareNames(a, b){
  return String(a || '').localeCompare(String(b || ''), undefined, {sensitivity: 'base'});
}

/* Turns a display name into a lowercase_snake_case filename stem, for
   export filenames/foldernames that should read as the thing's name
   rather than its internal id (see exportQuest/exportQuestline in
   src/export/export-actions.js). */
export function slugify(name){
  return (name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'untitled';
}

/* Reduces a raw field value to plain, matchable text: <br> tags become
   spaces, bold/italic markdown markers are dropped (keeping their
   contents), and the same STYLE_TAG_RE used by formatInline strips
   {b}/{i}/{m}/{/}/{#hex}
   wrapping -- so "{#ca9d6e}{b}Herald of Port Haven{/}{/}" reduces to plain
   "Herald of Port Haven" for name-matching (see suggestLinks in
   src/import/link-suggestions.js). Real variable placeholders like
   {username} are left in place, same as formatInline. */
export function plainTextForMatching(raw){
  if(!raw) return '';
  var t = raw.replace(/<br\s*\/?>/gi, ' ');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  t = t.replace(STYLE_TAG_RE, '');
  return t;
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
