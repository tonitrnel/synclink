import { defineConfig } from 'vite';
import type { CompilerOptions } from 'typescript';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import wasm from 'vite-plugin-wasm';
import toml from 'toml';
import fs from 'node:fs/promises';
import path from 'node:path';

const __ROOT = process.cwd();
const parseTSAlias = async () => {
  try {
    const { baseUrl = '.', paths = {} }: CompilerOptions = await fs
      .readFile(path.join(__ROOT, '/tsconfig.json'))
      .then((r) => {
        const content = r
          .toString()
          .replace(/^\s+\/\*.+\*\/\s*$/gm, '')
          .replace(/\/\/.*$/gm, '');
        return JSON.parse(content).compilerOptions;
      });
    return Object.keys(paths).reduce((alias, key) => {
      alias[key.toString().replace('/*', '')] = path.join(
        __ROOT,
        baseUrl,
        paths[key][0]?.replace('/*', '')
      );
      return alias;
    }, {} as Record<string, string>);
  } catch (e) {
    console.error('[Vite] Parse tsconfig failed, return empty alias', e);
    return {};
  }
};
const injectEnvironmentVariables = async (): Promise<void> => {
  const config = toml.parse(
    await fs
      .readFile(path.join(__ROOT, '../synclink-config.toml'))
      .then((r) => r.toString())
  ) as {
    server: {
      host: string;
      port: number;
    };
    https?: {
      port: number;
    };
  };

  process.env['VITE_APP_ENDPOINT'] = config.https
    ? `https://${config.server.host}:${config.https.port}/api`
    : `http://${config.server.host}:${config.server.port}/api`;
};

// https://vitejs.dev/config/
export default defineConfig(async () => {
  await injectEnvironmentVariables();
  console.log(await parseTSAlias());
  return {
    plugins: [react(), svgr(), wasm()],
    resolve: {
      alias: await parseTSAlias(),
    },
  };
});
