import '../styles/theme.css';
import '../styles/base.css';
import '../styles/canvas.css';
import '../styles/modal.css';
import '../styles/library.css';
import '../styles/world.css';
import '../styles/validate.css';

import { state, loadStore } from './state/store.js';

// Each of these modules attaches its own top-level event listeners as a
// side effect of being imported, exactly mirroring the original single
// <script>'s top-to-bottom execution — importing them here (in roughly
// the same order the original code defined them) is what wires up the
// whole app.
import './utils/text.js';
import './import/markdown-import.js';
import './import/quest-json-import.js';
import './render/cards.js';
import './render/wires.js';
import './render/sections.js';
import './canvas/pan-zoom.js';
import './canvas/connect.js';
import './canvas/drag.js';
import './editor/modal.js';
import './library/trash.js';
import './library/library-view.js';
import './world/world-view.js';
import './import/file-import.js';
import './validate/validate-ui.js';
import './theme.js';

import { switchToQuestline, restoreQuest, loadFromMarkdown } from './state/quest-switch.js';
import { showLibraryView } from './views.js';

/* ================= boot ================= */
(function boot(){
  var store = loadStore();
  // seed the global id counters once at startup; from here on they only
  // ever move forward, mirrored into the store on every save
  state.nextPageId = store.nextPageId;
  state.nextConnId = store.nextConnId;

  var openedQuestline = store.activeQuestlineId && store.questlines[store.activeQuestlineId]
    && switchToQuestline(store.activeQuestlineId);
  if(!openedQuestline){
    // re-read: switchToQuestline may have already flushed/changed things above
    var store2 = loadStore();
    var active = store2.activeQuestId ? store2.quests[store2.activeQuestId] : null;
    if(active){
      restoreQuest(active);
    } else {
      var defaultMd = document.getElementById('default-md').textContent;
      loadFromMarkdown(defaultMd, {questId: 'seed-meet-the-mercs', questName: 'Meet the Mercs'});
    }
  }
  // The app always opens on the library rather than dropping straight
  // back into whatever quest/questline was open last session — the block
  // above still restores that quest/questline into `state` (and seeds the
  // default quest on a first-ever launch) so its data is loaded and
  // available the moment it's picked from the library, but the canvas
  // itself isn't shown until the user actually chooses something.
  showLibraryView();
})();
