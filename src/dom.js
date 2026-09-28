/* ================= cached DOM element references =================
   Every element looked up once at module load time and reused everywhere
   else in the app, exactly mirroring the original single-script's
   top-level `var elXxx = document.getElementById(...)` declarations. */

export var elWorld = document.getElementById('world');
export var elCardsLayer = document.getElementById('cards-layer');
export var elCanvasArea = document.getElementById('canvas-area');
export var elViewport = document.getElementById('viewport');
export var elWires = document.getElementById('wires');
export var elZoomPct = document.getElementById('zoom-pct');
export var elQuestPill = document.getElementById('quest-pill');
export var elSaveStatus = document.getElementById('save-status');

export var elMarqueeBox = document.getElementById('marquee-box');

export var elModal = document.getElementById('modal');
export var elModalBackdrop = document.getElementById('modal-backdrop');
export var elModalName = document.getElementById('modal-name');
export var elModalPageId = document.getElementById('modal-pageid');
export var elModalFieldsList = document.getElementById('modal-fields-list');
export var elModalResponsesList = document.getElementById('modal-responses-list');
export var elModalSuggestedLinksRow = document.getElementById('modal-suggested-links-row');
export var elModalSuggestedLinks = document.getElementById('modal-suggested-links');

export var elTrashBackdrop = document.getElementById('trash-backdrop');
export var elTrashList = document.getElementById('trash-list');

export var elLinkedItemsToggle = document.getElementById('linked-items-toggle');
export var elLinkedItemsBtn = document.getElementById('linked-items-btn');
export var elLinkedItemsSidebar = document.getElementById('linked-items-sidebar');
export var elLinkedItemsSidebarClose = document.getElementById('linked-items-sidebar-close');
export var elLinkedItemsList = document.getElementById('linked-items-list');

export var elValidateQuestBtn = document.getElementById('validate-quest-btn');
export var elValidateBackdrop = document.getElementById('validate-backdrop');
export var elValidateSummary = document.getElementById('validate-summary');
export var elValidateIssues = document.getElementById('validate-issues');
export var elValidateClose = document.getElementById('validate-close');

export var elLibraryView = document.getElementById('library-view');
export var elWorldView = document.getElementById('world-view');
export var elAddCardBtn = document.getElementById('add-card-btn');
export var elClearCrossBtn = document.getElementById('clear-cross-btn');
export var elRelayoutBtn = document.getElementById('relayout-btn');

export var elOptionsBtn = document.getElementById('options-btn');
export var elOptionsMenu = document.getElementById('options-menu');
export var elExportAllBtn = document.getElementById('export-all-btn');
export var elImportStoreBtn = document.getElementById('import-store-btn');
export var elReorderQuestsBtn = document.getElementById('reorder-quests-btn');
export var elReorderBar = document.getElementById('reorder-bar');
export var elFinishReorderBtn = document.getElementById('finish-reorder-btn');

export var elNavLibraryPill = document.getElementById('nav-library-pill');
export var elNavWorldPill = document.getElementById('nav-world-pill');

export var elQuestlineGroups = document.getElementById('questline-groups');
export var elStandaloneQuests = document.getElementById('standalone-quests');

export var elWorldDirectory = document.getElementById('world-directory');
export var elWorldDetail = document.getElementById('world-detail');
export var elWorldLists = {
  factions: document.getElementById('world-list-factions'),
  npcs: document.getElementById('world-list-npcs'),
  locations: document.getElementById('world-list-locations')
};
export var elWorldDetailViewMode = document.getElementById('world-detail-view-mode');
export var elWorldDetailEditMode = document.getElementById('world-detail-edit-mode');
export var elWorldDetailKind = document.getElementById('world-detail-kind');
export var elWorldDetailTitle = document.getElementById('world-detail-title');
export var elWorldDetailFields = document.getElementById('world-detail-fields');
export var elWorldDetailEditFields = document.getElementById('world-detail-edit-fields');
export var elWorldDetailEditBtn = document.getElementById('world-detail-edit-btn');
export var elWorldDetailSaveBtn = document.getElementById('world-detail-save-btn');
export var elWorldDetailCancelBtn = document.getElementById('world-detail-cancel-btn');
export var elWorldDetailDeleteBtn = document.getElementById('world-detail-delete-btn');
export var elWorldDetailCrumbWorld = document.getElementById('world-detail-crumb-world');
export var elWorldDetailCrumbCategory = document.getElementById('world-detail-crumb-category');
export var elWorldDetailCrumbName = document.getElementById('world-detail-crumb-name');

export var elFileInput = document.getElementById('file-input');
export var elFolderInput = document.getElementById('folder-input');
export var elStoreFileInput = document.getElementById('store-file-input');
