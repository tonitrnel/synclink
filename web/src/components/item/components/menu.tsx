import {
  FC,
  memo,
  ReactNode,
  useCallback,
  useMemo,
  type MouseEvent,
} from 'react';
import { t } from '@lingui/macro';
import { DownloadCloudIcon, Share2Icon, EraserIcon, EllipsisIcon } from 'icons';
import { useSnackbar } from '~/components/ui/snackbar';
import { IEntity } from '~/constants/types';
import { executeAsyncTask } from '~/utils/execute-async-task';
import { downloadFromURL } from '~/utils/save-as';
import { useMediaQuery } from '~/utils/hooks/use-media-query';
import { useLingui } from '@lingui/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

export type CustomMenuSlot = {
  key: string;
  component: ReactNode;
  event: (evt: MouseEvent<HTMLElement>) => void;
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
    slots: slotsProp = [],
  }) => {
    const snackbar = useSnackbar();
    const i18n = useLingui();
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
    const slots = useMemo<CustomMenuSlot[]>(() => {
      return [
        ...slotsProp.filter(
          (it): it is CustomMenuSlot => typeof it === 'object',
        ),
        ...[
          features.includes('downloadable') &&
            ({
              key: '__download',
              component: (
                <>
                  <DownloadCloudIcon className="h-4 w-4" />
                  <span>{i18n._('Download')}</span>
                </>
              ),
              event: onDownload,
            } as CustomMenuSlot),
          features.includes('shareable') &&
            SUPPORTED_SHARE &&
            ({
              key: '__share',
              component: (
                <>
                  <Share2Icon className="h-4 w-4" />
                  <span>{i18n._('Share')}</span>
                </>
              ),
              event: () => onShare(entity),
            } as CustomMenuSlot),
          features.includes('deletable') &&
            ({
              key: '__delete',
              component: (
                <>
                  <EraserIcon className="h-4 w-4" />
                  <span>{i18n._('Delete')}</span>
                </>
              ),
              event: () => onDelete(entity.uid),
            } as CustomMenuSlot),
        ].filter((it): it is CustomMenuSlot => typeof it === 'object'),
      ];
    }, [entity, features, i18n, onDelete, onDownload, onShare, slotsProp]);
    return <ButtonGroup slots={slots} />;
  },
);

interface MenuButtonGroupProps {
  slots: Array<CustomMenuSlot>;
}

const ButtonGroup: FC<MenuButtonGroupProps> = ({ slots }) => {
  const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
  return isMobile ? (
    <div className="flex items-center gap-3 whitespace-nowrap text-sm">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className="rounded p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <EllipsisIcon className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {slots.map((it) => (
            <DropdownMenuItem
              key={it.key}
              onClick={it.event}
              className="flex items-center gap-1 [&>svg]:text-gray-600"
            >
              {it.component}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : (
    <div className="flex items-center gap-3 whitespace-nowrap text-sm">
      {slots.map((it) => (
        <button key={it.key} className="cedasync-item-link" onClick={it.event}>
          {it.component}
        </button>
      ))}
    </div>
  );
};
