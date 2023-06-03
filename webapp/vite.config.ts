import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import wasm from 'vite-plugin-wasm';
import toml from 'toml';
import fs from 'node:fs/promises';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const config = toml.parse(
    await fs
      .readFile(path.join(process.cwd(), '../synclink-config.toml'))
      .then((r) => r.toString())
  );
  process.env['VITE_APP_ENDPOINT'] = config.https
    ? `https://${config.server.host}:${config.https.port}/api`
    : `http://${config.server.host}:${config.server.port}/api`;

  return {
    plugins: [react(), svgr(), wasm()],
  };
});
