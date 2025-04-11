import { FC, useCallback, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { useVersionQuery } from '~/endpoints';
import { LoaderIcon } from 'lucide-react';
import { z } from 'zod';
import { Layout } from './_widgets/layout.tsx';
import { useUserStore } from '~/store';
import { useNavigate } from 'react-router-dom';

const AriaAccessView: FC<{
  version: string;
  onAccess(aria: Schema['access_preference']): void;
}> = ({ version, onAccess }) => {
  const [accessPreference, setAccessPreference] =
    useState<Schema['access_preference']>('public');
  const ariaOptions = useMemo(
    () =>
      [
        {
          value: 'public',
          label: 'Public area',
        },
        {
          value: 'private',
          label: 'Private area',
        },
      ] satisfies {
        label: string;
        value: Schema['access_preference'];
      }[],
    [],
  );
  return (
    <section>
      <div className="mt-8 space-y-6">
        <div className="text-sm">
          <span className="mr-1 font-medium">Server:</span>
          <span className="text-gray-400">Ephemera v{version}</span>
        </div>
        <fieldset aria-label="aria">
          <legend className="text-sm font-medium">Choose an aria</legend>
          <div role="radiogroup">
            {ariaOptions.map((it) => (
              <div
                key={it.value}
                aria-label={it.label}
                data-checked={it.value === accessPreference ? '' : undefined}
                className="data-[checked]:text-primary my-4 cursor-pointer rounded-lg border border-gray-300 px-3 py-4 text-sm text-gray-500 hover:border-blue-500 data-[checked]:border-blue-500 data-[checked]:shadow"
                onClick={() => setAccessPreference(it.value)}
              >
                {it.label}
              </div>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => onAccess(accessPreference)}>
          {accessPreference === 'public' ? 'Access' : 'Sign in'}
        </Button>
      </div>
    </section>
  );
};

const AriaUnavailable: FC<{ onAccess(aria: 'none'): void }> = ({
  onAccess,
}) => {
  return (
    <section>
      <div className="mt-8 space-y-6">
        <div className="text-sm">
          <span className="mr-1 font-medium">Server:</span>
          <span className="text-gray-400">{'<unavaliabe>'}</span>
        </div>
        <p className="text-sm">
          由于缺少可用服务器，Ephemera 绝大数功能将无法使用
        </p>
        <p className="text-sm">这通常发生在 Demo 演示</p>
        <p className="text-sm">
          如果你是自行部署请确保 Nginx 等代理服务配置正确，如有需要可以提交{' '}
          <a
            href="https://github.com/tonitrnel/ephemera/issues"
            className="underline hover:text-blue-500"
          >
            issues
          </a>
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => onAccess('none')}>我明白</Button>
        </div>
      </div>
    </section>
  );
};

const schema = z.object({
  server: z.string().optional(),
  access_preference: z.enum(['public', 'private', 'none']),
});
type Schema = z.infer<typeof schema>;

export default function WelcomePage() {
  const { done, data: serverVersion, error: missingServer } = useVersionQuery();
  const userStore = useUserStore();
  const navigate = useNavigate();
  const onAccess = useCallback((aria: Schema['access_preference']) => {
    switch (aria) {
      case 'public': {
        userStore.setAccessAria(aria);
        navigate('/stash');
        break;
      }
      case 'private': {
        navigate('/sign-in', {
          state: {
            server: __ENDPOINT__,
            version: serverVersion,
          },
        });
        break;
      }
      case 'none': {
        userStore.setAccessAria(aria);
        navigate('/transfer');
        break;
      }
    }
  }, []);

  return (
    <Layout>
      {!done && (
        <section className="flex h-[calc(100%_-_5.5rem)] w-full items-center justify-center">
          <LoaderIcon className="h-6 w-6 animate-spin text-gray-500" />
        </section>
      )}
      {serverVersion && (
        <AriaAccessView
          version={serverVersion?.slice('ephemera'.length)}
          onAccess={onAccess}
        />
      )}
      {!!missingServer && <AriaUnavailable onAccess={onAccess} />}
    </Layout>
  );
}
