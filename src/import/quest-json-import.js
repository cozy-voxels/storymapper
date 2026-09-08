import { state } from '../state/store.js';

/* ================= JSON quest import (QuestLines mod format) =================
   Imports the real quest JSON files under QuestLines/quests (including
   questline subfolders), as opposed to the hand-authored draft .md tables.
   Field text is carried over literally,
   including the game's {#hex}/{b}/{i} inline formatting codes — the app
   doesn't yet know how to render those (only markdown-style bold/italic
   and {TBD} placeholders), so they'll show as raw text for now. */

function jsonLinesToBr(s){
  return String(s).replace(/\r\n|\r|\n/g, ' <br> ');
}

/* Finds every `page:<id>` action in an actions array — that's the real
   same-quest dialogue jump, distinct from the Pages array's listed order. */
export function findPageRefs(actionsArr){
  var refs = [];
  (actionsArr || []).forEach(function(a){
    var m = /^page:(.+)$/.exec(String(a).trim());
    if(m) refs.push(m[1]);
  });
  return refs;
}

/* Finds every quest-state gate (questStarted:/questCompleted:/etc.) in a
   requirements array that points at a DIFFERENT quest — used to auto-draw
   cross-quest connections when importing a whole questline folder. */
export function findQuestStateRefs(reqsArr){
  var refs = [];
  (reqsArr || []).forEach(function(r){
    var m = /^quest(Started|Completed|NotStarted|NotCompleted):(.+)$/.exec(String(r).trim());
    if(m) refs.push({raw: r, questId: m[2]});
  });
  return refs;
}

/* Builds {pages, connections} from one parsed quest JSON object. Pages are
   NOT laid out here (x/y stay 0) — the caller decides layout, since a
   re-import needs to preserve existing positions rather than reflow
   everything. Connections ARE built here since they don't depend on
   layout, following page: action references with a sequential fallback
   for any page that page: never reaches (so nothing is left floating). */
export function buildQuestFromJson(qj){
  var pageIds = (qj.Pages && qj.Pages.length) ? qj.Pages.slice() : Object.keys(qj.PageData || {});
  var idByPageId = {};
  var pages = pageIds.map(function(pid){
    var internalId = 'p' + (state.nextPageId++);
    idByPageId[pid] = internalId;
    return {id: internalId, pageId: pid, title: (qj.PageData && qj.PageData[pid] && qj.PageData[pid].Name) || pid, fields: [], x: 0, y: 0};
  });

  pages.forEach(function(page){
    var pd = (qj.PageData && qj.PageData[page.pageId]) || {};
    var fields = [];
    if(pd.Dialog) fields.push({key: 'Dialog', value: jsonLinesToBr(pd.Dialog)});
    if(pd.JournalText) fields.push({key: 'JournalText', value: jsonLinesToBr(pd.JournalText)});
    if(pd.Responses && pd.Responses.length){
      var lines = [];
      pd.Responses.forEach(function(r){
        lines.push('- ' + (r.Text || ''));
        (r.Requirements || []).forEach(function(rq){ lines.push('— requires: ' + rq); });
        (r.Actions || []).forEach(function(a){ lines.push('— ' + a); });
      });
      fields.push({key: 'Response(s)', value: lines.join(' <br> ')});
    }
    if(pd.Requirements && pd.Requirements.length) fields.push({key: 'Requirements', value: pd.Requirements.join(' <br> ')});
    if(pd.Objectives && pd.Objectives.length) fields.push({key: 'Objectives', value: pd.Objectives.join(' <br> ')});
    if(pd.LoadActions && pd.LoadActions.length) fields.push({key: 'LoadActions', value: pd.LoadActions.join(' <br> ')});
    page.fields = fields;
  });

  var connections = [];
  var touched = {};
  pages.forEach(function(page){
    var pd = (qj.PageData && qj.PageData[page.pageId]) || {};
    // Track which response (if any) produced each page: ref, so the arrow
    // can be labeled with it — a card with two responses that lead to two
    // different pages otherwise draws two unlabeled arrows with no way to
    // tell which choice goes where.
    var refs = findPageRefs(pd.LoadActions).map(function(toPid){
      return {toPid: toPid, label: null};
    });
    (pd.Responses || []).forEach(function(r){
      findPageRefs(r.Actions).forEach(function(toPid){
        refs.push({toPid: toPid, label: r.Text || null});
      });
    });
    refs.forEach(function(ref){
      var toId = idByPageId[ref.toPid];
      if(!toId || toId === page.id) return;
      var exists = connections.some(function(c){ return c.from === page.id && c.to === toId; });
      if(exists) return;
      var conn = {id: 'w' + (state.nextConnId++), from: page.id, to: toId, fromSide: 'right', toSide: 'left'};
      if(ref.label) conn.label = ref.label;
      connections.push(conn);
      touched[page.id] = true;
      touched[toId] = true;
    });
  });
  // Fallback: a page that page: never reaches or leaves would otherwise be
  // stranded with no arrows at all — connect it to the next page in the
  // Pages array's listed order, same as the .md importer does for every page.
  pages.forEach(function(page, idx){
    if(touched[page.id]) return;
    var next = pages[idx + 1];
    if(next) connections.push({id: 'w' + (state.nextConnId++), from: page.id, to: next.id, fromSide: 'right', toSide: 'left'});
  });

  // The Pages array in the source JSON is often listed in whatever order
  // the mod author happened to write the pages, not the order they're
  // actually visited in play — laying out by that raw order tends to run
  // the dialogue backwards. Reorder for layout purposes by walking the
  // arrows we just built instead: start from the page(s) nothing points
  // at (the real entry point) and follow page: connections outward, so
  // the grid reads left-to-right/top-to-bottom the way the quest is
  // actually played.
  pages = orderPagesByFlow(pages, connections);

  return {pages: pages, connections: connections, meta: {description: qj.Description, repeatable: !!qj.Repeatable, rewards: qj.Rewards}};
}

/* Reorders pages by walking outgoing page: connections breadth-first from
   the page(s) with no incoming connection (the entry point(s)) — used so
   layoutPages(), which places pages into its grid in array order, follows
   the actual dialogue flow rather than the source JSON's listed order.
   Anything a cycle or missing root leaves unreachable keeps its original
   relative order, appended after the main flow rather than dropped. */
export function orderPagesByFlow(pages, connections){
  var outgoing = {}, incoming = {}, byId = {};
  pages.forEach(function(p){ outgoing[p.id] = []; incoming[p.id] = 0; byId[p.id] = p; });
  connections.forEach(function(c){
    if(outgoing[c.from]) outgoing[c.from].push(c.to);
    if(incoming[c.to] !== undefined) incoming[c.to]++;
  });
  var roots = pages.filter(function(p){ return incoming[p.id] === 0; });
  if(!roots.length && pages.length) roots = [pages[0]]; // every page has an incoming arrow (a cycle) — no true start, so just pick one
  var visited = {}, ordered = [];
  function bfs(startId){
    var queue = [startId];
    visited[startId] = true;
    while(queue.length){
      var id = queue.shift();
      if(byId[id]) ordered.push(byId[id]);
      (outgoing[id] || []).forEach(function(toId){
        if(!visited[toId]){ visited[toId] = true; queue.push(toId); }
      });
    }
  }
  roots.forEach(function(r){ if(!visited[r.id]) bfs(r.id); });
  pages.forEach(function(p){ if(!visited[p.id]) ordered.push(p); });
  return ordered;
}
