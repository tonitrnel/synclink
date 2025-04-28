import { CopyIcon } from 'lucide-react';
import {
    FC,
    memo,
    useState,
    useMemo,
    useCallback,
    HTMLAttributes,
} from 'react';
import { copy } from '~/utils/copy';
import { CustomMenuSlot, Menu } from './menu';
import { Metadata } from './metadata';
import { clsx } from '~/utils/clsx';
import { useLingui } from '@lingui/react';
import { openViewer } from '~/components/viewer-dialog';
import { RenderProps } from './type.ts';
import { useEntry } from '../../../_hooks/use-entry.ts';

/**
 * 文本项
 *
 * @tips 高度未知
 */
export const TextItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
    ({ className, ...props }) => {
        const entry = useEntry();
        const i18n = useLingui();
        const isLarge = entry.content === undefined;
        const [expanded, setExpanded] = useState(false);
        const copyButton = useMemo<CustomMenuSlot>(
            () => ({
                key: 'copy',
                event: async () => {
                    if (!entry.content) return void 0;
                    await copy(entry.content);
                },
                component: (
                    <>
                        <CopyIcon className="h-4 w-4" />
                        <span className="capitalize">{i18n._('Copy')}</span>
                    </>
                ),
            }),
            [entry.content, i18n],
        );
        const [html, expandable] = useMemo((): [
            context: string,
            expandable: boolean,
        ] => {
            if (!entry.content) return ['', false];
            let text = entry.content;
            let expandable = false;
            if (text.length > 300 && !expanded) {
                expandable = true;
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
            return [text, expandable];
        }, [entry.content, expanded]);
        const onContinue = useCallback(() => {
            setExpanded(true);
        }, []);
        const onLoadContentInViewer = useCallback(() => {
            openViewer({
                resourceId: entry.id,
                filename: entry.name,
                mimetype: entry.mimetype,
                extname: 'txt',
            });
        }, [entry.name, entry.mimetype, entry.id]);
        return (
            <div className={clsx('', className)} {...props}>
                {isLarge ? (
                    <p className="mt-0 text-sm text-gray-600 italic">
                        <span>
                            {i18n._(
                                'The content of this text is a bit large, so it will not be actively load.',
                            )}
                        </span>
                        <button
                            onClick={onLoadContentInViewer}
                            className="m-0 mt-2 block cursor-pointer border-0 bg-transparent p-0 leading-none text-gray-600 italic underline outline-0"
                        >
                            {i18n._('Load content in viewer')}
                        </button>
                    </p>
                ) : (
                    <p
                        className={clsx(
                            'mt-0 min-h-[2rem] w-full text-sm leading-relaxed break-words whitespace-break-spaces text-gray-900 italic',
                        )}
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                )}
                {!expanded && expandable && (
                    <button
                        className="cursor-pointer border-none bg-transparent p-0 text-gray-600 italic underline"
                        onClick={onContinue}
                    >
                        {i18n._('Continue read')}
                    </button>
                )}

                <div className="mt-4 flex items-center justify-between">
                    <Metadata />
                    <Menu
                        features={[
                            isLarge && 'downloadable',
                            'shareable',
                            'deletable',
                        ]}
                        slots={[!isLarge && copyButton]}
                    />
                </div>
            </div>
        );
    },
);
