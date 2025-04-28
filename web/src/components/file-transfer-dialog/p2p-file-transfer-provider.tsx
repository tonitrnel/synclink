import { FC, memo, useEffect, useState } from 'react';
import { useDialog } from '~/utils/hooks/use-dialog.ts';
import { P2pFileTransferDialog } from './p2p-file-transfer-dialog.tsx';
import { event, FileTransferOptions } from './event.ts';
import { useNavigate } from 'react-router-dom';

const DesktopImpl: FC = () => {
    const [state, setState] = useState<FileTransferOptions>();
    const fileTransferDialog = useDialog(P2pFileTransferDialog);
    useEffect(() => {
        return event.on('open', (options) => {
            setState(options);
            if (!fileTransferDialog.visible) {
                fileTransferDialog.open();
            }
        });
    }, [fileTransferDialog]);
    if (!fileTransferDialog.visible) return null;
    return (
        <fileTransferDialog.Dialog
            {...fileTransferDialog.DialogProps}
            {...state}
        />
    );
};
const MobileImpl: FC = () => {
    const navigate = useNavigate();
    useEffect(() => {
        return event.on('open', (options) => {
            if (window.location.pathname == '/file-transfer') {
                import('~/pages/mobile/file-transfer').then((mod) => {
                    mod.default.signal.emit('update', options);
                });
            } else {
                navigate('/file-transfer', { state: options });
            }
        });
    }, [navigate]);
    return null;
};

export const P2PFileTransferProvider: FC<{ isMobile: boolean }> = memo(
    ({ isMobile }) => {
        return isMobile ? <MobileImpl /> : <DesktopImpl />;
    },
);
