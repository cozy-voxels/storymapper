/* ================= read-only viewer entry (view/index.html) =================
   Loads the adjacent data.json and shows it with the editor's view code,
   leaving out every editing module. Only the theme preference is saved. */
import '../styles/theme.css';
import '../styles/base.css';
import '../styles/canvas.css';
import '../styles/modal.css';
import '../styles/library.css';
import '../styles/world.css';

import { setPublishedStore } from './state/store.js';
import { elLibraryView, elCanvasArea, elQuestlineGroups, elStandaloneQuests } from './dom.js';
import { escapeHtml } from './utils/text.js';

import './render/cards.js';
import './render/wires.js';
import './render/sections.js';
import './canvas/pan-zoom.js';
import './views.js';
import './library/library-view.js';
import './world/world-view.js';
import './canvas/linked-items-panel.js';
import './theme.js';
import { startRouter } from './view/router.js';

var DATA_URL = 'data.json';

function showLoadError(message){
  elCanvasArea.style.display = 'none';
  elLibraryView.classList.add('open');
  elQuestlineGroups.innerHTML = '<div class="library-empty">Couldn&rsquo;t load ' + DATA_URL + ': ' + escapeHtml(message) +
    '. It must sit next to this page, and the page must be opened from a web server (not straight from a file on disk).</div>';
  elStandaloneQuests.innerHTML = '';
}

(function boot(){
  fetch(DATA_URL, {cache: 'no-cache'})
    .then(function(res){
      if(!res.ok) throw new Error('the server answered ' + res.status + ' ' + res.statusText);
      return res.text();
    })
    .then(function(text){
      var data;
      try{ data = JSON.parse(text); }
      catch(e){ throw new Error('it is not valid JSON'); }
      if(!data || typeof data !== 'object' || !data.quests){
        throw new Error('it is not a StoryMapper export (no quests found)');
      }
      setPublishedStore(text);
      startRouter();
    })
    .catch(function(err){
      showLoadError(err && err.message ? err.message : String(err));
    });
})();
