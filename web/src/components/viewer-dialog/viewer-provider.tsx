import { FC, useEffect } from 'react';
import { useDialog } from '~/utils/hooks/use-dialog';
import { ViewerDialog } from './viewer-dialog';
import { event } from './event';

export const ViewerProvider: FC = () => {
  const viewerDialog = useDialog(ViewerDialog);
  useEffect(() => {
    return event.on('open', (options) => {
      viewerDialog.open(options);
    });
  }, [viewerDialog]);
  if (!viewerDialog.visible) return null;
  return <viewerDialog.Dialog {...viewerDialog.DialogProps} />;
};
