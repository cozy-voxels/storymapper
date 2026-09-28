import { state } from '../state/store.js';
import { serializeResponses } from '../utils/text.js';

/* ================= JSON quest import (QuestLines mod format) =================
   Imports quest JSON files from QuestLines/quests. Field text, including
   {#hex}/{b}/{i} formatting codes, is copied as-is. */

function jsonLinesToBr(s){
  return String(s).replace(/[ \t]*(?:\r\n|\r|\n)[ \t]*/g, '<br>');
}

/* Returns the target ids of `page:<id>` actions (same-quest dialogue jumps). */
export function findPageRefs(actionsArr){
  var refs = [];
  (actionsArr || []).forEach(function(a){
    var m = /^page:(.+)$/.exec(String(a).trim());
    if(m) refs.push(m[1]);
  });
  return refs;
}

/* Returns quest-state requirements (questStarted:/questCompleted:/etc.),
   used to draw cross-quest arrows on questline folder import. */
export function findQuestStateRefs(reqsArr){
  var refs = [];
  (reqsArr || []).forEach(function(r){
    var m = /^quest(Started|Completed|NotStarted|NotCompleted):(.+)$/.exec(String(r).trim());
    if(m) refs.push({raw: r, questId: m[2]});
  });
  return refs;
}

/* Builds {pages, connections} from a parsed quest JSON. Pages are not laid
   out (x/y = 0); the caller handles layout so re-imports keep positions.
   Connections follow page: actions, with a sequential fallback for pages
   that have none. */
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
      var responses = pd.Responses.map(function(r){
        return {text: r.Text || '', requirements: r.Requirements || [], actions: r.Actions || []};
      });
      fields.push({key: 'Response(s)', value: serializeResponses(responses)});
    }
    if(pd.Requirements && pd.Requirements.length) fields.push({key: 'Requirements', value: pd.Requirements.join('<br>')});
    if(pd.Objectives && pd.Objectives.length) fields.push({key: 'Objectives', value: pd.Objectives.join('<br>')});
    if(pd.LoadActions && pd.LoadActions.length) fields.push({key: 'LoadActions', value: pd.LoadActions.join('<br>')});
    // Rare, mostly undocumented flags. They only ever appear as `true`, so a
    // 'true' marker field is enough to round-trip them.
    if(pd.AutoTrigger) fields.push({key: 'AutoTrigger', value: 'true'});
    if(pd.RequiresResponse) fields.push({key: 'RequiresResponse', value: 'true'});
    page.fields = fields;
  });

  var connections = [];
  var touched = {};
  pages.forEach(function(page){
    var pd = (qj.PageData && qj.PageData[page.pageId]) || {};
    // Label each arrow with the response that produced it, if any.
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
  // Fallback: connect a page with no page: arrows to the next page in
  // Pages order, as the .md importer does.
  pages.forEach(function(page, idx){
    if(touched[page.id]) return;
    var next = pages[idx + 1];
    if(next) connections.push({id: 'w' + (state.nextConnId++), from: page.id, to: next.id, fromSide: 'right', toSide: 'left'});
  });

  // IMPORTANT: `pages` keeps the source Pages order. It's the mod's
  // evaluation priority (first page whose Requirements pass wins), and
  // export must reproduce it. layoutOrder is a flow-ordered copy used only
  // for the initial grid layout.
  var layoutOrder = orderPagesByFlow(pages, connections);

  return {pages: pages, layoutOrder: layoutOrder, connections: connections, meta: {description: qj.Description, repeatable: !!qj.Repeatable, rewards: qj.Rewards, requirements: qj.Requirements}};
}

/* Orders pages breadth-first from the entry pages (no incoming arrows) so
   layoutPages() follows the dialogue flow. Unreachable pages are appended
   in their original order. */
export function orderPagesByFlow(pages, connections){
  var outgoing = {}, incoming = {}, byId = {};
  pages.forEach(function(p){ outgoing[p.id] = []; incoming[p.id] = 0; byId[p.id] = p; });
  connections.forEach(function(c){
    if(outgoing[c.from]) outgoing[c.from].push(c.to);
    if(incoming[c.to] !== undefined) incoming[c.to]++;
  });
  var roots = pages.filter(function(p){ return incoming[p.id] === 0; });
  if(!roots.length && pages.length) roots = [pages[0]]; // all pages in a cycle: start from the first
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
