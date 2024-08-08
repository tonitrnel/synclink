import { useEffect } from 'react';
import { FilesOrEntries } from '~/constants/types.ts';

// register global paste event
export const usePasteEvent = (
  receivedTransferData: (
    filesOrEntries: FilesOrEntries,
    from: 'drop' | 'paste',
  ) => Promise<void>,
) => {
  useEffect(() => {
    const listener = async (evt: ClipboardEvent) => {
      const files = evt.clipboardData?.files;
      if (!files || files?.length == 0) return void 0;
      await receivedTransferData(
        {
          type: 'multi-file',
          files: [...files],
        },
        'paste',
      );
    };
    document.addEventListener('paste', listener);
    return () => {
      document.removeEventListener('paste', listener);
    };
  }, [receivedTransferData]);
};
