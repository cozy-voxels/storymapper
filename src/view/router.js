/* ================= read-only viewer: hash routes =================
   Makes every view in the viewer linkable and back/forward-able:
     #/story                    the Story library
     #/quest/<id>               one quest's canvas
     #/questline/<id>           a whole questline's canvas
     #/world                    the World directory
     #/world/<category>/<id>    one Faction/NPC/Location
   The hash follows the app (via view-events.js, fired after every view
   change) and the app follows the hash (on hashchange). An unknown or
   malformed route falls back to the Story library. */
import { state, loadStore } from '../state/store.js';
import { onViewChange } from '../state/view-events.js';
import { showLibraryView } from '../views.js';
import { switchToQuest, switchToQuestline } from '../state/quest-switch.js';
import { showWorldView, showWorldItem } from '../world/world-view.js';

function routeFromState(){
  if(state.view === 'canvas'){
    if(state.activeQuestlineId) return '#/questline/' + encodeURIComponent(state.activeQuestlineId);
    if(state.questId) return '#/quest/' + encodeURIComponent(state.questId);
  }
  if(state.view === 'world') return '#/world';
  if(state.view === 'world-item'){
    return '#/world/' + encodeURIComponent(state.worldCategory) + '/' + encodeURIComponent(state.worldItemId);
  }
  return '#/story';
}

// While a route is being applied, the resulting view change only
// normalizes the URL in place rather than adding another history entry.
var applying = false;

function applyRoute(hash){
  var parts = hash.replace(/^#\/?/, '').split('/').map(function(p){
    try{ return decodeURIComponent(p); } catch(e){ return p; }
  });
  applying = true;
  try{
    if(parts[0] === 'quest' && parts[1] && loadStore().quests[parts[1]]){
      switchToQuest(parts[1]);
      return;
    }
    if(parts[0] === 'questline' && parts[1] && switchToQuestline(parts[1])) return;
    if(parts[0] === 'world'){
      if(!parts[1]){ showWorldView(); return; }
      showWorldItem(parts[1], parts[2]);
      if(state.view === 'world-item' && state.worldCategory === parts[1] && state.worldItemId === parts[2]) return;
    }
    showLibraryView();
  } finally {
    applying = false;
  }
}

export function startRouter(){
  onViewChange(function(){
    var hash = routeFromState();
    if(location.hash === hash) return;
    if(applying) history.replaceState(null, '', hash);
    else location.hash = hash;
  });
  window.addEventListener('hashchange', function(){
    if(location.hash !== routeFromState()) applyRoute(location.hash);
  });
  applyRoute(location.hash);
}
