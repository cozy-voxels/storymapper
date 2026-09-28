import '../styles/theme.css';
import '../styles/base.css';
import '../styles/canvas.css';
import '../styles/modal.css';
import '../styles/library.css';
import '../styles/world.css';
import '../styles/validate.css';

import { state, loadStore } from './state/store.js';

// These modules attach their event listeners on import.
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
import './canvas/linked-items-panel.js';
import './import/file-import.js';
import './import/store-import.js';
import './validate/validate-ui.js';
import './theme.js';

import { switchToQuestline, restoreQuest, loadFromMarkdown } from './state/quest-switch.js';
import { showLibraryView } from './views.js';

/* ================= boot ================= */
(function boot(){
  var store = loadStore();
  // seed the global id counters; they only increase and are saved with the store
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
  // Always open on the library. The last quest is still loaded into
  // `state` above, but the canvas stays hidden until one is picked.
  showLibraryView();
})();
