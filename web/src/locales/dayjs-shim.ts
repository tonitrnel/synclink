// see https://github.com/vitejs/vite/issues/14102
export const dayjsLocales = {
  'zh-CN': () => import('dayjs/locale/zh-cn.js'),
  en: () => import('dayjs/locale/en.js'),
} satisfies Record<
  string,
  () => Promise<{
    default: unknown;
  }>
>;
