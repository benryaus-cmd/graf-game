import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import fs from 'fs';
import path from 'path';

// Embeds the real project source files as a virtual manifest for the dev viewer.
const projectFileManifestPlugin = (): Plugin => {
  const VIRTUAL_ID = 'virtual:project-file-manifest';
  const RESOLVED_ID = '\0' + VIRTUAL_ID;
  const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.html', '.md', '.txt', '.yaml', '.yml']);
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.aippy']);
  const isSensitive = (relPath: string) => /(^|\/)\.env/i.test(relPath) || /secret|credential|\.pem$|\.key$/i.test(relPath);

  const collect = async (root: string) => {
    const files: unknown[] = [];
    const folders = new Set<string>();
    const walk = async (absDir: string, relPrefix: string) => {
      const entries = await fs.promises.readdir(absDir, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = relPrefix + entry.name;
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          folders.add(relPath + '/');
          await walk(path.join(absDir, entry.name), relPath + '/');
          continue;
        }
        if (isSensitive(relPath)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        const absPath = path.join(absDir, entry.name);
        const base = {
          path: relPath,
          name: entry.name,
          dir: relPrefix || './',
          ext,
          size: 0,
          status: 'BINARY' as string,
        };
        try {
          const stat = await fs.promises.stat(absPath);
          base.size = stat.size;
          if (TEXT_EXTENSIONS.has(ext)) {
            const content = await fs.promises.readFile(absPath, 'utf8');
            files.push({ ...base, status: content.length === 0 ? 'EMPTY' : 'TEXT', content });
          } else {
            files.push(base);
          }
        } catch (error) {
          files.push({ ...base, status: 'FAILED', error: String(error) });
        }
      }
    };
    await walk(root, '');
    files.sort((a, b) => String(a.path).localeCompare(String(b.path)));
    return { generatedAt: Date.now(), files, folders: [...folders].sort() };
  };

  return {
    name: 'project-file-manifest',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const manifest = await collect(import.meta.dirname);
      return `export default ${JSON.stringify(manifest)}`;
    },
  };
};
import { viteSingleFile } from 'vite-plugin-singlefile';
/** IMPORTANT: DO NOT REMOVE THIS LINE */
import { aippyTaggerPlugin, aippyPreloadPlugin, assetConstantsPlugin } from '@aippy/vite-plugins';

export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080
  },
  // IMPORTANT: DO NOT REMOVE THIS THREE PLUGINS
  plugins: [
    projectFileManifestPlugin(),
    react(),
    tailwindcss(),
    // Development only: asset constants plugin
    mode === 'development' && assetConstantsPlugin({
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.mp4', '.mp3', '.wav', '.ogg', '.webm'],
      srcDir: 'src',
      outputFile: 'src/config/assets.json',
      devMode: true
    }),
    // Development only: component tagging for inspector
    mode === 'development' && aippyTaggerPlugin(),
    // bundle optimization
    viteSingleFile({
      useRecommendedBuildConfig: true,
      removeViteModuleLoader: true,
      deleteInlinedFiles: true
    }),
    // asset preload for aippy app (scans source files)
    aippyPreloadPlugin({
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.wav', '.ogg', '.webm', '.task', '.tflite'],
      srcDir: 'src',
      outDir: 'dist',
      deepScan: true
    }),
    // Remove inspector script in production
    mode === 'production' && {
      name: 'remove-inspector-script',
      transformIndexHtml(html: string) {
        return html.replace(
          /<!-- Inspector script for iframe editing mode -->[\s\S]*?<!-- Inspector script end -->/,
          ''
        );
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  build: {
    sourcemap: mode === 'development',
    minify: mode === 'production',
  },
}));
