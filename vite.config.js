import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// base './' so the build works from a GitHub Pages project subpath
// (user.github.io/ithaca/) without knowing the repo name at build time.
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        builder: resolve(__dirname, 'builder.html'),
      },
    },
  },
  // .ttf files are imported as URLs and fetched at PDF-generation time.
  assetsInclude: ['**/*.ttf'],
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
