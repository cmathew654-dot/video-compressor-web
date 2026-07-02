import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// CSP is injected only into the built HTML (apply: 'build'), never during `vite dev`,
// so the dev server keeps working with unrestricted inline scripts/HMR.
const CSP_PAGES =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src blob:; worker-src 'self' blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";

const CSP_SINGLE =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src blob:; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";

function cspPlugin(mode: string): Plugin {
  const csp = mode === 'single' ? CSP_SINGLE : CSP_PAGES;
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [cspPlugin(mode), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
  },
}));
