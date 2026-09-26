/* ================= app mode =================
   The published, read-only viewer (view/index.html) marks its <html> with
   data-mode="view". Shared modules check READ_ONLY to leave out editing UI
   and handlers there; the editor (index.html) has no data-mode at all. */
export var READ_ONLY = document.documentElement.dataset.mode === 'view';
