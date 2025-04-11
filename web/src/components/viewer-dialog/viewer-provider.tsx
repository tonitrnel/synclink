import { FC, memo, useEffect } from 'react';
import { useDialog } from '~/utils/hooks/use-dialog';
import { ViewerDialog } from './viewer-dialog';
import { event } from './event';
import { useNavigate } from 'react-router-dom';

const DesktopImpl: FC = () => {
  const viewerDialog = useDialog(ViewerDialog);
  useEffect(() => {
    return event.on('open', (options) => {
      viewerDialog.open(options);
    });
  }, [viewerDialog]);
  if (!viewerDialog.visible) return null;
  return <viewerDialog.Dialog {...viewerDialog.DialogProps} />;
};
const MobileImpl: FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    return event.on('open', (options) => {
      navigate('/viewer', { state: options });
    });
  }, [navigate]);
  return null;
};

export const ViewerProvider: FC<{ isMobile: boolean }> = memo(
  ({ isMobile }) => {
    return isMobile ? <MobileImpl /> : <DesktopImpl />;
  },
);
