import { Layout } from '~/components/layout/layout.tsx';
import { DesktopInput } from '~/components/input';
import { List } from './_components/list/list.tsx';
import { useEffect } from 'react';
import { notifyManager } from '~/utils/notify-manager.ts';

export default function StashPage() {
    useEffect(() => {
        notifyManager.connect().catch(console.error)
    }, [])
    return (
        <Layout titleBarProps={{ title: '暂存区' }}>
            <div className="relative flex h-full w-full flex-col bg-white px-6 pb-6">
                <List className="w-full flex-1" />
                <DesktopInput className="mx-auto w-full max-w-4xl" />
            </div>
        </Layout>
    );
}
