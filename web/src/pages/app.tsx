import { FC, PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { dynamicActivate } from '~/locales';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { SnackbarProvider } from '~/components/ui/snackbar';
import { TooltipProvider } from '~/components/ui/tooltip';
import { Toaster } from '~/components/ui/toast';
import { createHttpClient, HttpClientProvider } from '@painted/http';
import { Routes } from '~/routes';
import dayjs from 'dayjs';
import { dayjsLocales } from '~/locales/dayjs-shim.ts';
import './globals.css';
import './app.css';

const DynamicI18nLayer: FC<PropsWithChildren> = ({ children }) => {
  const [language] = useState(
    () => localStorage.getItem('language') || navigator.language,
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Promise.all([
      (async () => {
        dayjs.locale(
          await (
            dayjsLocales[language as keyof typeof dayjsLocales] ||
            dayjsLocales['en']
          )().then((mod) => mod.default),
        );
      })(),
      dynamicActivate(language),
    ]).then(() => {
      document.documentElement.lang = language;
      setLoaded(true);
    }, console.error);
  }, [language]);
  if (!loaded) return null;
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
};
const CredentialLayer: FC<PropsWithChildren> = ({ children }) => {
  const [secret] = useState(() => localStorage.getItem('secret')?.trim());
  const client = useMemo(() => {
    return createHttpClient({
      baseUrl: __ENDPOINT__,
      fetcher: async (request) => {
        if (secret) {
          request.headers.append('Authorization', `Bearer ${secret}`);
        }
        try {
          const response = await fetch(request);
          if (!response.ok) {
            const error = new Error(await response.text());
            Reflect.set(error, 'raw', response);
            // noinspection ExceptionCaughtLocallyJS
            throw error;
          }
          const clonedResponse = response.clone();
          const data = await (async () => {
            const type = response.headers
              .get('Content-Type')
              ?.split(';')[0]
              ?.trim();
            if (!type) return void 0;
            if (type.startsWith('text/')) return await response.text();
            else if (type === 'application/json') return await response.json();
            else return void 0;
          })();
          return [data, clonedResponse];
        } catch (e) {
          // rewrite error type
          if (e instanceof TypeError) {
            throw new Error(e.message);
          } else {
            throw e;
          }
        }
      },
    });
  }, [secret]);
  return <HttpClientProvider value={client}>{children}</HttpClientProvider>;
};
const UIProviderLayer: FC<PropsWithChildren> = ({ children }) => {
  return (
    <SnackbarProvider>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </SnackbarProvider>
  );
};

export default function App() {
  return (
    <DynamicI18nLayer>
      <CredentialLayer>
        <UIProviderLayer>
          <Routes />
        </UIProviderLayer>
      </CredentialLayer>
    </DynamicI18nLayer>
  );
}
