import { defineConfig } from 'vite';

/* Builds only the read-only viewer (view/index.html) into dist-view/, with
   relative asset paths so the folder can be published at any URL path.
   Upload dist-view/ plus a data.json (editor: Options -> "Export for
   publishing...") placed next to its index.html. */
export default defineConfig({
  root: 'view',
  base: './',
  build: {
    outDir: '../dist-view',
    emptyOutDir: true
  }
});
