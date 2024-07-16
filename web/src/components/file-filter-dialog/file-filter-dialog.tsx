import { FC, memo, useCallback, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Trash2Icon, UploadIcon } from 'icons';
import { Chips, type ChipsChangeEvent } from 'primereact/chips';
import { withProduce } from '~/utils/with-produce.ts';
import { InputText } from 'primereact/inputtext';
import { Tooltip } from 'primereact/tooltip';

interface State {
  files: {}[];
  tags: string[];
  caption: string;
}

export const FileFilterDialog: FC<{
  mode: 'file' | 'directory';
  visible: boolean;
  onClose: () => void;
}> = memo(({ visible }) => {
  const [state, setState] = useState<State>(() => ({
    files: [],
    tags: [],
    caption: '',
  }));
  const onConfirm = useCallback(() => {}, []);
  const onCancel = useCallback(() => {}, []);
  const onChipsChange = useCallback((evt: ChipsChangeEvent) => {
    const value = !evt.value ? [] : evt.value;
    withProduce(setState, (draft) => {
      draft.tags = [...value];
    });
  }, []);
  return (
    <Dialog visible={visible} closable={false} onHide={onCancel}>
      <header>
        <div className="p-metergroup-meter-container">
          <Tooltip>
            <span
              className="p-metergroup-meter bg-[#68686b]"
              style={{ width: '16%' }}
            />
          </Tooltip>
          <span
            className="p-metergroup-meter bg-[#34d399]"
            style={{ width: '1%' }}
          />
        </div>
      </header>
      <main>
        <div>
          <label htmlFor="caption">Caption</label>
          <InputText id="caption" />
        </div>
        <div>
          <label htmlFor="tags">Tags</label>
          <Chips
            id="tags"
            value={state.tags}
            onChange={onChipsChange}
            separator=","
          />
        </div>
      </main>
      <footer>
        <Button severity="danger">
          <Trash2Icon className="w-5 h-5" />
          <span>Discard</span>
        </Button>
        <Button severity="secondary">
          <UploadIcon />
          <span>Upload</span>
        </Button>
      </footer>
    </Dialog>
  );
});
