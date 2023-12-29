import type { LinguiConfig } from '@lingui/conf';

export default {
  locales: ['en-US', 'zh-CN'],
  catalogs: [
    {
      path: 'src/locales/{locale}',
      include: ['src'],
    },
  ],
} satisfies LinguiConfig;
