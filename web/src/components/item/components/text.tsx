import { CopyIcon } from 'lucide-react';
import {
  FC,
  memo,
  useState,
  useMemo,
  useCallback,
  HTMLAttributes,
} from 'react';
import { useFileContentQuery } from '~/endpoints';
import { copy } from '~/utils/copy';
import { withProduce } from '~/utils/with-produce';
import { useEntity } from '../hooks/use-entity.ts';
import { CustomMenuSlot, Menu } from './menu';
import { Metadata } from './metadata';
import { clsx } from '~/utils/clsx';
import { useLingui } from '@lingui/react';
import { openViewer } from '~/components/viewer-dialog';
import { useCoordinator } from '../hooks/use-coordinator.ts';
import { RenderProps } from './type.ts';

/**
 * 文本项
 *
 * @tips 高度未知
 */
export const TextItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ visible, className, ...props }) => {
    const entity = useEntity();
    const i18n = useLingui();
    const unconfirmed = entity.size > 4096 && entity.content === undefined;
    const {
      data: content = entity.content,
      pending: loading,
      done,
      error,
    } = useFileContentQuery({
      path: {
        id: entity.uid,
      },
      enabled: !unconfirmed && entity.content === undefined,
      keepDirtyOnNotEnabled: true,
    });
    const [{ expandable, expanded }, setExpanded] = useState(() => ({
      expandable: false,
      expanded: false,
    }));
    useCoordinator(
      entity.uid,
      unconfirmed || done || entity.content !== undefined,
    );
    const copyButton = useMemo<CustomMenuSlot>(
      () => ({
        key: 'copy',
        event: async () => {
          if (!content) return void 0;
          await copy(content);
        },
        component: (
          <>
            <CopyIcon className="h-4 w-4" />
            <span className="capitalize">{i18n._('Copy')}</span>
          </>
        ),
      }),
      [content, i18n],
    );
    const html = useMemo(() => {
      if (!content) return '';
      let text = content;
      if (text.length > 300 && !expanded) {
        withProduce(setExpanded, (draft) => void (draft.expandable = true));
        text = text.substring(0, 300) + '...';
      }
      {
        const textNode = document.createTextNode(text);
        const p = document.createElement('p');
        p.appendChild(textNode);
        text = p.innerHTML;
        // noinspection HtmlUnknownTarget
        text = text.replace(
          /(?<href>https?:\/\/[\w-_]+(?:\.\w+)+[^\s)]+)/gm,
          `<a class='underline' target='_blank' referrerpolicy='no-referrer' href="$<href>">$<href><svg aria-hidden="true" fill="none" focusable="false" height="1em" shape-rendering="geometricPrecision" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" class="inline ml-1 mb-0.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path></svg></a>`,
        );
      }
      return text;
    }, [content, expanded]);
    const onContinue = useCallback(() => {
      withProduce(setExpanded, (draft) => void (draft.expanded = true));
    }, []);
    const onLoadContentInViewer = useCallback(() => {
      openViewer({
        resourceId: entity.uid,
        filename: entity.name,
        mimetype: entity.type,
        extname: 'txt',
      });
    }, [entity.name, entity.type, entity.uid]);
    return (
      <div className={clsx('', className)} {...props}>
        {unconfirmed || (loading && !error) ? (
          <p className="mt-0 italic text-gray-600">
            <span>
              {i18n._(
                'The content of this text is a bit large, so it will not be actively load.',
              )}
            </span>
            <button
              onClick={onLoadContentInViewer}
              className="m-0 mt-2 block cursor-pointer border-0 bg-transparent p-0 italic leading-none text-gray-600 underline outline-0"
            >
              {loading ? (
                <span>loading</span>
              ) : (
                <span>{i18n._('Load content in viewer')}</span>
              )}
              {loading && <span className="ani_dot">...</span>}
            </button>
          </p>
        ) : error ? (
          <p className="text-error-main">{String(error)}</p>
        ) : (
          <p
            className={clsx(
              'mt-0 min-h-[2rem] w-full whitespace-break-spaces break-words text-sm italic leading-relaxed text-gray-900',
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        {!expanded && expandable && (
          <button
            className="cursor-pointer border-none bg-transparent p-0 italic text-gray-600 underline"
            onClick={onContinue}
          >
            {i18n._('Continue read')}
          </button>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Metadata entity={entity} />
          <Menu
            entity={entity}
            features={[unconfirmed && 'downloadable', 'shareable', 'deletable']}
            slots={[!unconfirmed && copyButton]}
          />
        </div>
      </div>
    );
  },
);
