import { defineConfig } from 'vite';
import type { CompilerOptions } from 'typescript';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import wasm from 'vite-plugin-wasm';
import top_await from 'vite-plugin-top-level-await';
import fs from 'node:fs/promises';
import path from 'node:path';

const __PROJECT = process.cwd();
const parseProject = async () => {
  return fs
    .readFile(path.join(__PROJECT, '/package.json'))
    .then<{ version: string }>((buf) => JSON.parse(buf.toString()));
};
const parseTSAlias = async () => {
  try {
    const { baseUrl = '.', paths = {} }: CompilerOptions = await fs
      .readFile(path.join(__PROJECT, '/tsconfig.json'))
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
          __PROJECT,
          baseUrl,
          paths[key][0]?.replace('/*', '')
        );
        return alias;
      },
      { '@': path.join(__PROJECT, 'src') } as Record<string, string>
    );
  } catch (e) {
    console.error('[Vite] Parse tsconfig failed, return empty alias', e);
    return {};
  }
};

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const project = await parseProject();
  return {
    define: {
      __ENDPOINT: '"/api"',
      __VERSION: JSON.stringify(project.version),
      __BUILD_TIMESTAMP: Date.now(),
    },
    plugins: [react(), svgr(), wasm(), top_await()],
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
      plugins: [wasm(), top_await()],
    },
  };
});
