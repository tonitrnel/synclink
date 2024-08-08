import { useLingui } from '@lingui/react';
import { AnimationPage } from '~/components/animation-page';
import { FileTransferImpl } from '~/components/file-transfer-dialog';

export default function FileTransferPage() {
  const i18n = useLingui();
  return (
    <AnimationPage className="flex flex-col">
      <header className="p-4">
        <h2 className="font-bold">{i18n._('Peer to peer file transfer')}</h2>
      </header>
      <main className="relative flex-1 p-4">
        <FileTransferImpl />
      </main>
    </AnimationPage>
  );
}
