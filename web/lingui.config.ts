import { defineConfig } from "@lingui/cli";


export default defineConfig({
  sourceLocale: "en",
  locales: ['en-US', 'zh-CN'],
  catalogs: [
    {
      path: 'src/locales/{locale}',
      include: ['src'],
    },
  ],
});
