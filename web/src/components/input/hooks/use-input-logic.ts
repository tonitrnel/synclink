import {
    ChangeEventHandler,
    KeyboardEventHandler,
    RefObject,
    useMemo,
    useState,
} from 'react';
import { executeAsyncTask } from '~/utils/execute-async-task.ts';
import { upload } from '~/utils/upload.ts';
import { openFilePicker } from '~/utils/open-file-picker.ts';
import { featureCheck } from '~/utils/feature-check.ts';
import { t } from '@lingui/macro';
import { IGNORE_FILE_TYPE } from '~/constants';
import { FilesOrEntries } from '~/constants/types.ts';
import { useSnackbar } from '~/components/ui/snackbar';
import { useLatestFunc, useLatestRef } from '@ptdgrp/shared';
import { Logger } from '~/utils/logger.ts';

const logger = new Logger('Input');

export type InputTransformer = (options: {
    mode: 'file' | 'directory';
    filesOrEntries: FilesOrEntries;
}) => Promise<
    | {
          entries: FilesOrEntries;
          tags: string[];
          caption: string;
      }
    | undefined
>;

export const useInputLogic = (
    textareaRef: RefObject<HTMLTextAreaElement>,
    inputTransformer: InputTransformer,
) => {
    const [text, setText] = useState('');
    const textRef = useLatestRef(text);
    const [transmitting, setTransmitting] = useState(false);
    const snackbar = useSnackbar();
    const transformer = useLatestFunc(inputTransformer);
    const handlers = useMemo(
        () =>
            new (class InputHandler {
                send = executeAsyncTask(async (): Promise<void> => {
                    const value = textRef.current.trim();
                    if (value.length === 0) return void 0;
                    setTransmitting(true);
                    try {
                        await upload({
                            type: 'multi-file',
                            files: [
                                new File([value], '', { type: 'text/plain' }),
                            ],
                        });
                        setText('');
                    } catch (e) {
                        logger.error('Seed Failed', e);
                        snackbar.enqueueSnackbar({
                            message: String(e),
                            variant: 'error',
                        });
                    } finally {
                        setTransmitting(false);
                    }
                });
                uploadFile = executeAsyncTask(async (): Promise<void> => {
                    const files = await openFilePicker(['*'], true);
                    if (files.length === 0) return void 0;
                    const value = await transformer({
                        mode: 'file',
                        filesOrEntries: {
                            type: 'multi-file',
                            files,
                        },
                    });
                    if (!value) {
                        console.log('upload canceled');
                        return void 0;
                    }
                    try {
                        await upload(value.entries, value.caption, value.tags);
                    } catch (e) {
                        logger.error('Upload Failed', e);
                        snackbar.enqueueSnackbar({
                            message: String(e),
                            variant: 'error',
                        });
                    }
                });
                uploadFolder = executeAsyncTask(async (): Promise<void> => {
                    const files = await openFilePicker(['*'], false, true);
                    if (files.length === 0) return void 0;
                    const value = await transformer({
                        mode: 'directory',
                        filesOrEntries: {
                            type: 'multi-file',
                            files,
                        },
                    });
                    if (!value) return void 0;
                    try {
                        await upload(value.entries, value.caption, value.tags);
                    } catch (e) {
                        logger.error('Upload Failed', e);
                        snackbar.enqueueSnackbar({
                            message: String(e),
                            variant: 'error',
                        });
                    }
                });
                paste = executeAsyncTask(async (): Promise<void> => {
                    try {
                        featureCheck('clipboard');
                    } catch (e) {
                        snackbar.enqueueSnackbar({
                            message: String(e),
                            variant: 'error',
                        });
                        return void 0;
                    }
                    try {
                        const data = await navigator.clipboard.read();
                        if (data.length === 0) {
                            snackbar.enqueueSnackbar({
                                message: t`paste file is empty`,
                                variant: 'warning',
                            });
                            return void 0;
                        }
                        const items = await Promise.all(
                            data
                                .map((it) => {
                                    const type = it.types
                                        .filter(
                                            (type) =>
                                                !IGNORE_FILE_TYPE.includes(
                                                    type,
                                                ),
                                        )
                                        .at(-1);
                                    if (!type) return null;
                                    return it.getType(type);
                                })
                                .filter((it): it is NonNullable<typeof it> =>
                                    Boolean(it),
                                )
                                .reverse(),
                        );
                        const item = items[0];
                        if (item.type.startsWith('text/')) {
                            setText(
                                await item.text().then((text) => text.trim()),
                            );
                            textareaRef.current?.focus();
                        } else {
                            await upload({
                                type: 'multi-file',
                                files: [
                                    new File([item], '', { type: item.type }),
                                ],
                            });
                        }
                    } catch (e) {
                        if (e instanceof Error) {
                            if (
                                e.message.includes('No valid data on clipboard')
                            ) {
                                logger.error('cannot to paste such files');
                                snackbar.enqueueSnackbar({
                                    message: t`cannot to paste such files`,
                                    variant: 'error',
                                });
                            } else {
                                snackbar.enqueueSnackbar({
                                    message: e.message,
                                    variant: 'error',
                                });
                            }
                        } else {
                            logger.error('Pasted Failed', e);
                        }
                    }
                });
                keyup = executeAsyncTask<KeyboardEventHandler>(
                    async (evt): Promise<void> => {
                        if (evt.ctrlKey && evt.key === 'Enter') {
                            evt.preventDefault();
                            await this.send();
                        }
                    },
                );
                clear = (): void => {
                    setText('');
                };
                change: ChangeEventHandler<HTMLTextAreaElement> = (evt) => {
                    setText(evt.target.value);
                };
                receivedTransferData = async (
                    filesOrEntries: FilesOrEntries,
                    from: 'drop' | 'paste',
                ): Promise<void> => {
                    if (
                        from == 'paste' &&
                        filesOrEntries.type == 'multi-file' &&
                        filesOrEntries.files.length == 1 &&
                        filesOrEntries.files[0].size < 2097152 &&
                        filesOrEntries.files[0].type.startsWith('image/')
                    ) {
                        try {
                            await upload(filesOrEntries, undefined, undefined);
                        } catch (e) {
                            logger.error('Upload Failed', e);
                            snackbar.enqueueSnackbar({
                                message:
                                    e instanceof Error ? e.message : String(e),
                                variant: 'error',
                            });
                        }
                    } else {
                        const value = await transformer({
                            mode:
                                filesOrEntries.type == 'multi-file'
                                    ? 'file'
                                    : 'directory',
                            filesOrEntries,
                        });
                        if (!value) return void 0;
                        try {
                            await upload(
                                value.entries,
                                value.caption,
                                value.tags,
                            );
                        } catch (e) {
                            logger.error('Upload Failed', e);
                            snackbar.enqueueSnackbar({
                                message:
                                    e instanceof Error ? e.message : String(e),
                                variant: 'error',
                            });
                        }
                    }
                };
                openVoiceRecorder = async () => {

                }
            })(),
        [snackbar, textRef, textareaRef, transformer],
    );
    const transmittable = useMemo(() => text.trim().length > 0, [text]);
    return {
        text,
        textRef,
        setText,
        handlers,
        transmitting,
        transmittable,
    } as const;
};
