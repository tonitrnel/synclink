import { EventBus } from '~/utils/event-bus.ts';
import { FilesOrEntries } from '~/constants/types.ts';

export default function FileUploadPage() {}

FileUploadPage.signal = new EventBus<{
  enter: {
    mode: 'file' | 'directory';
    filesOrEntries: FilesOrEntries;
  };
  exit:
    | {
        entries: FilesOrEntries;
        tags: string[];
        caption: string;
      }
    | undefined;
}>();
