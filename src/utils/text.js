/* ================= text formatting helpers ================= */
export function escapeHtml(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Style tags only: {b} {i} {m} {/} {#hexcolor}. Variables like {username}
// or {variable:x} don't match.
var STYLE_TAG_RE = /\{(#[0-9a-fA-F]{6}|\/|b|i|m)\}/g;

export function formatInline(raw) {
	if (!raw) return '';
	var parts = raw.split(/(<br\s*\/?>)/i);
	var out = parts.map(function (part) {
		if (/^<br\s*\/?>$/i.test(part)) return '<br>';
		var t = escapeHtml(part);
		t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
		t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
		// Card view drops style tags but keeps variables. The edit modal
		// shows the raw text.
		t = t.replace(STYLE_TAG_RE, '');
		return t;
	});
	return out.join('').trim();
}

/* Card title with style tags stripped. The edit modal uses the raw title. */
export function formatCardTitle(raw) {
	if (!raw) return '';
	return escapeHtml(raw).replace(/\{[^}]+\}/g, '').trim();
}

/* Splits on <br> and on real newlines, since hand-typed values mix both. */
export function splitLines(raw) {
	return raw.split(/<br\s*\/?>|\r\n|\r|\n/i).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
}

/* Converts stored <br> to newlines for a textarea, and back on save.
   Blank lines are kept (so "<br><br>" survives), and spaces around line
   breaks are trimmed. */
export function brToText(raw) {
	if (!raw) return '';
	return raw.replace(/[ \t]*<br\s*\/?>[ \t]*/gi, '\n');
}

export function textToBr(text) {
	if (!text) return '';
	return text.replace(/[ \t]*(?:\r\n|\r|\n)[ \t]*/g, '<br>');
}

/* A page's response texts (no sub-lines), offered as wire labels. */
export function responseChoicesForPage(page) {
	var field = (page.fields || []).filter(function (f) { return f.key === 'Response(s)'; })[0];
	if (!field) return [];
	return parseResponses(field.value).map(function (r) { return r.text; }).filter(Boolean);
}

/* "- " starts a new response. So does a bare line when no response is open
   yet (single-response pages often skip the dash). "— " lines and labels
   are sub-content. */
function isResponseStart(line, hasCurrent) {
	if (/^-/.test(line)) return true;
	return !hasCurrent && !/^—/.test(line) && !sectionLabel(line);
}

/* Matches a "Requirement(s):" / "Action(s):" label in any common spelling,
   with or without a "— " prefix. Returns {section, rest} or null. */
var SECTION_LABEL_RE = /^(requirement|action)(s|\(s\))?\s*:?\s*/i;
function sectionLabel(text) {
	var m = SECTION_LABEL_RE.exec(text);
	if (!m) return null;
	return { section: m[1].toLowerCase() === 'requirement' ? 'requirements' : 'actions', rest: text.slice(m[0].length).trim() };
}

/* Parses a Response(s) field's flat blob into structured
   {text, requirements[], actions[]} objects. This is the real QuestLines
   Response shape, stored flattened in page.fields (inverse:
   serializeResponses()).

   Also accepts looser hand-typed input: a first response with no "- "
   (see isResponseStart()), and a label line that applies to the lines
   after it until the next response or label. */
export function parseResponses(raw) {
	if (!raw) return [];
	var responses = [];
	var current = null;
	var currentSection = null;
	splitLines(raw).forEach(function (line) {
		if (isResponseStart(line, !!current)) {
			current = { text: line.replace(/^[-—]\s*/, ''), requirements: [], actions: [] };
			responses.push(current);
			currentSection = null;
			return;
		}
		if (!current) return; // sub-line with no response to attach to
		var content = line.replace(/^—\s*/, '');
		var label = sectionLabel(content);
		if (label) {
			currentSection = label.section;
			if (label.rest) current[currentSection].push(label.rest);
			return;
		}
		if (currentSection) {
			current[currentSection].push(content);
			return;
		}
		var reqMatch = /^requires:\s*(.*)$/i.exec(content);
		if (reqMatch) current.requirements.push(reqMatch[1]);
		else current.actions.push(content);
	});
	return responses;
}

/* Inverse of parseResponses(). Drops empty responses. */
export function serializeResponses(responses) {
	var lines = [];
	(responses || []).forEach(function (r) {
		var text = (r.text || '').trim();
		var reqs = (r.requirements || []).filter(function (x) { return x.trim(); });
		var actions = (r.actions || []).filter(function (x) { return x.trim(); });
		if (!text && !reqs.length && !actions.length) return;
		lines.push('- ' + text);
		reqs.forEach(function (rq) { lines.push('— requires: ' + rq); });
		actions.forEach(function (a) { lines.push('— ' + a); });
	});
	return lines.join('<br>');
}

/* Normalizes <br>/<br/>/<BR> variants and surrounding spaces to '<br>'. */
export function normalizeBr(raw) {
	if (!raw) return raw;
	return raw.replace(/\s*<br\s*\/?>\s*/gi, '<br>');
}

export function renderBulletField(raw, tone) {
	var lines = splitLines(raw);
	if (!lines.length) return '';
	var html = '<ul class="bullet-list tone-' + tone + '">';
	var openSub = false;
	lines.forEach(function (line) {
		var isSub = /^—/.test(line);
		if (isSub) {
			var subText = line.replace(/^—\s*/, '');
			if (!openSub) { html += '<ul class="bullet-sub">'; openSub = true; }
			html += '<li>' + formatInline(subText) + '</li>';
		} else {
			if (openSub) { html += '</ul>'; openSub = false; }
			var topText = line.replace(/^-\s*/, '');
			var isLabel = /:$/.test(topText) && !/^-/.test(line);
			html += '<li class="' + (isLabel ? 'label-line' : '') + '">' + formatInline(topText) + '</li>';
		}
	});
	if (openSub) html += '</ul>';
	html += '</ul>';
	return html;
}

/* Card display for Response(s): one bullet per response, with
   "Requires:"/"Actions:" sub-lists when present. */
export function renderResponses(responses) {
	if (!responses || !responses.length) return '';
	var html = '<ul class="bullet-list tone-response">';
	responses.forEach(function (r) {
		html += '<li>' + formatInline(r.text) + '</li>';
		if (r.requirements.length || r.actions.length) {
			html += '<ul class="bullet-sub">';
			if (r.requirements.length) {
				html += '<li class="label-line">Requires:</li>';
				r.requirements.forEach(function (rq) { html += '<li>' + formatInline(rq) + '</li>'; });
			}
			if (r.actions.length) {
				html += '<li class="label-line">Actions:</li>';
				r.actions.forEach(function (a) { html += '<li>' + formatInline(a) + '</li>'; });
			}
			html += '</ul>';
		}
	});
	html += '</ul>';
	return html;
}

export function looksLikeBulletField(raw) {
	return /(^|<br\s*\/?>)\s*[-—]/i.test(raw);
}

export function renderSimpleList(items, tone) {
	if (!items || !items.length) return '';
	var html = '<ul class="bullet-list tone-' + tone + '">';
	items.forEach(function (line) {
		html += '<li>' + formatInline(line) + '</li>';
	});
	html += '</ul>';
	return html;
}

/* Splits a Note(s) cell into Requirements, Objectives and LoadActions.
   Unlabeled lines go to Requirements. */
export function classifyNoteLines(raw) {
	var lines = splitLines(raw);
	var reqs = [], objs = [], loads = [];
	lines.forEach(function (line) {
		var stripped = line.replace(/^[-—]\s*/, '').trim();
		if (!stripped) return;
		if (/^requirement\(s\)\s*:?\s*$/i.test(stripped)) return;
		var mObj = stripped.match(/^objective\(s\)\s*:\s*(.*)$/i);
		if (mObj) { if (mObj[1].trim()) objs.push(mObj[1].trim()); return; }
		var mLoad = stripped.match(/^load\s*action\s*:\s*(.*)$/i);
		if (mLoad) { if (mLoad[1].trim()) loads.push(mLoad[1].trim()); return; }
		reqs.push(stripped);
	});
	return { reqs: reqs, objs: objs, loads: loads };
}

/* Case-insensitive name compare for sorting. */
export function compareNames(a, b) {
	return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

/* Display name -> lowercase_snake_case, for export file/folder names. */
export function slugify(name) {
	return (name || '').toLowerCase().trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'untitled';
}

/* Plain text for name matching (see suggestLinks): <br> becomes a space,
   and markdown markers and style tags are removed. Variables are kept. */
export function plainTextForMatching(raw) {
	if (!raw) return '';
	var t = raw.replace(/<br\s*\/?>/gi, ' ');
	t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
	t = t.replace(STYLE_TAG_RE, '');
	return t;
}

export function expandNoteFields(fields) {
	var out = [];
	fields.forEach(function (f) {
		var keyLower = f.key.toLowerCase();
		if (keyLower === 'note(s)' || keyLower === 'notes') {
			var c = classifyNoteLines(f.value);
			if (c.reqs.length) out.push({ key: 'Requirements', value: c.reqs.join('<br>') });
			if (c.objs.length) out.push({ key: 'Objectives', value: c.objs.join('<br>') });
			if (c.loads.length) out.push({ key: 'LoadActions', value: c.loads.join('<br>') });
			return;
		}
		out.push(f);
	});
	return out;
}
