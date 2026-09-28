/* ================= app mode =================
   The read-only viewer (view/index.html) sets data-mode="view" on <html>.
   Shared modules check READ_ONLY to skip editing UI and handlers. */
export var READ_ONLY = document.documentElement.dataset.mode === 'view';
