import { useLingui } from '@lingui/react';
import { AnimationPage } from '~/components/animation-page';
import { FileTransferImpl } from '~/components/file-transfer-dialog';
import { useLocation, Location, Navigate, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { EventBus } from '~/utils/event-bus.ts';

interface PageState {
  mode: 'sender' | 'receiver';
  id?: string;
}

export default function FileTransferPage() {
  const [state, setState] = useState<PageState>();
  const i18n = useLingui();
  const navigate = useNavigate();
  const location = useLocation() as Location<PageState>;
  const gotoHome = useCallback(() => {
    if (history.length > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);
  useEffect(() => {
    return FileTransferPage.signal.on('update', (value) => {
      setState(value);
    });
  }, []);
  if (!location || !location.state) return <Navigate to="/" replace />;
  return (
    <AnimationPage className="flex flex-col">
      <header className="p-4">
        <h2 className="font-bold">{i18n._('Peer to peer file transfer')}</h2>
      </header>
      <main className="relative flex-1 p-4">
        <FileTransferImpl
          id={state?.id || location.state.id}
          mode={state?.mode || location.state.mode}
          isDialog={false}
          onClose={gotoHome}
        />
      </main>
    </AnimationPage>
  );
}
FileTransferPage.signal = new EventBus<{
  update: {
    mode: 'sender' | 'receiver';
    id?: string;
  };
}>();
