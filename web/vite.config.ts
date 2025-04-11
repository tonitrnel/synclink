import { defineConfig, UserConfig } from 'vite';
import type { CompilerOptions } from 'typescript';
import react from '@vitejs/plugin-react-swc';
import svgr from '@svgr/rollup';
import { lingui } from '@lingui/vite-plugin';
import wasm from 'vite-plugin-wasm';
import top_await from 'vite-plugin-top-level-await';
import { VitePWA as pwa } from 'vite-plugin-pwa';
import tailwindcss from "@tailwindcss/vite"
import fs from 'node:fs/promises';
import path from 'node:path';

const __PROJECT__ = process.cwd();
const parseProject = async () => {
  return fs.readFile(path.join(__PROJECT__, '/package.json')).then<{
    version: string;
  }>((buf) => JSON.parse(buf.toString()));
};
const parseTSAlias = async () => {
  try {
    const { baseUrl = '.', paths = {} }: CompilerOptions = await fs
      .readFile(path.join(__PROJECT__, '/tsconfig.app.json'))
      .then((r) => {
        const content = r
          .toString()
          .replace(/^\s+\/\*.+\*\/\s*$/gm, '')
          .replace(/\/\/.*$/gm, '');
        return JSON.parse(content).compilerOptions;
      });
    return Object.keys(paths).reduce(
      (alias, key) => {
        alias[key.toString().replace('/*', '')] = path.join(
          __PROJECT__,
          baseUrl,
          paths[key][0]?.replace('/*', ''),
        );
        return alias;
      },
      { '@': path.join(__PROJECT__, 'src') } as Record<string, string>,
    );
  } catch (e) {
    console.error('[Vite] Parse tsconfig failed, return empty alias', e);
    process.exit(1);
  }
};

// https://vitejs.dev/config/
export default defineConfig(async ({ command }) => {
  const project = await parseProject();
  return {
    define: {
      __ENDPOINT__: command == 'build' ? '""' : '"http://localhost:8080"',
      __VERSION__: JSON.stringify(project.version),
      __BUILD_TIMESTAMP__: Date.now(),
    },
    plugins: [
      wasm(),
      top_await(),
      react({
        plugins: [['@lingui/swc-plugin', {}]],
      }),
      svgr(),
      lingui(),
      pwa({
        registerType: 'autoUpdate',
      }),
      tailwindcss()
    ],
    resolve: {
      alias: await parseTSAlias(),
    },
    server: {
      port: 8081,
      strictPort: true,
      proxy: {
        '/api': 'http://localhost:8080',
      },
    },
    worker: {
      plugins: () => [wasm(), top_await()],
    },
  } satisfies UserConfig;
});
