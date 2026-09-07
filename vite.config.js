import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  preview: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    // Real cache-busting: every JS/CSS/image filename gets a content hash
    // baked in by Vite/Rollup, so a changed file always gets a new name and
    // a browser (or CDN) can never serve a stale cached copy under the same
    // URL. This replaces the manual "?v=" query strings in the source files
    // — those were a manual stand-in for exactly this, and are no longer
    // needed once a real build step exists.
    assetsDir: 'assets',
    sourcemap: false, // smaller production output; flip to true if you need to debug a production-only bug
    minify: 'esbuild', // fast, solid minification for both JS and CSS
    cssMinify: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  }
});
