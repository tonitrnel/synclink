import {
  FC,
  memo,
  ReactNode,
  useCallback,
  useMemo,
  type MouseEvent,
} from 'react';
import { t } from '@lingui/macro';
import { DownloadCloudIcon, Share2Icon, EraserIcon } from 'icons';
import { useSnackbar } from '~/components/snackbar';
import { IEntity } from '~/constants/types';
import { executeAsyncTask } from '~/utils/execute-async-task';
import { downloadFromURL } from '~/utils/save-as';

export type CustomMenuSlot = {
  key: string;
  component: ReactNode;
  event: (evt: MouseEvent<HTMLButtonElement>) => void;
};

const SUPPORTED_SHARE =
  typeof window.navigator.share === 'function' &&
  typeof window.navigator.canShare === 'function';

export const Menu: FC<{
  entity: IEntity;
  features?: Array<
    | 'previewable'
    | 'downloadable'
    | 'deletable'
    | 'shareable'
    | false
    | undefined
  >;
  slots?: Array<CustomMenuSlot | false | undefined>;
}> = memo(
  ({
    entity,
    features = ['downloadable', 'deletable', 'shareable'],
    slots = [],
  }) => {
    const snackbar = useSnackbar();
    const onDelete = useMemo(
      () =>
        executeAsyncTask(async (uid: string) => {
          await fetch(`${__ENDPOINT__}/api/file/${uid}`, {
            method: 'DELETE',
          });
          document.body.dispatchEvent(new CustomEvent('refresh-stats'));
        }),
      [],
    );
    const onShare = useMemo(
      () =>
        executeAsyncTask(async (entity: IEntity) => {
          if (
            typeof navigator.share !== 'function' ||
            !('canShare' in navigator)
          )
            return void 0;
          const data = await (async (): Promise<ShareData | void> => {
            // 5 MB
            if (entity.size > 5_242_880) {
              return {
                title: entity.name,
                url: `${__ENDPOINT__}/api/file/${entity.uid}`,
              };
            }
            if (entity.type.startsWith('text/')) {
              return {
                title: entity.name,
                text: await fetch(
                  `${__ENDPOINT__}/api/file/${entity.uid}`,
                ).then((res) => res.text()),
              };
            }
            return {
              title: entity.name,
              files: [
                await fetch(`${__ENDPOINT__}/api/file/${entity.uid}`)
                  .then((res) => res.blob())
                  .then(
                    (blob) =>
                      new File([blob], entity.name, { type: entity.type }),
                  ),
              ],
            };
          })();
          try {
            if (data && navigator.canShare(data)) await navigator.share(data);
            else {
              snackbar.enqueueSnackbar({
                message: t`can't share this file`,
                variant: 'warning',
              });
            }
          } catch (e) {
            snackbar.enqueueSnackbar({
              message: e instanceof Error ? e.message : String(e),
              variant: 'error',
            });
          }
        }),
      [snackbar],
    );
    const onDownload = useCallback(() => {
      downloadFromURL(
        `${__ENDPOINT__}/api/file/${entity.uid}?raw`,
        entity.name,
      );
    }, [entity.name, entity.uid]);
    return (
      <div className="flex gap-3 items-center whitespace-nowrap text-sm">
        {slots
          .filter((it): it is CustomMenuSlot => typeof it === 'object')
          .map((it) => (
            <button
              key={it.key}
              className="synclink-item-link"
              onClick={it.event}
            >
              {it.component}
            </button>
          ))}
        {features.includes('downloadable') && (
          <button className="synclink-item-link" onClick={onDownload}>
            <DownloadCloudIcon className="w-4 h-4" />
            <span className="capitalize">{t`download`}</span>
          </button>
        )}
        {features.includes('shareable') && SUPPORTED_SHARE && (
          <button
            className="synclink-item-link"
            onClick={() => onShare(entity)}
          >
            <Share2Icon className="w-4 h-4" />
            <span className="capitalize">{t`share`}</span>
          </button>
        )}
        {features.includes('deletable') && (
          <button
            className="synclink-item-link"
            onClick={() => onDelete(entity.uid)}
          >
            <EraserIcon className="w-4 h-4" />
            <span className="capitalize">{t`delete`}</span>
          </button>
        )}
      </div>
    );
  },
);
