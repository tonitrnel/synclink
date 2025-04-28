import { useEffect } from 'react';
import { __CACHE_NAME__, __CHANNEL__, __PREFIX__ } from '~/constants';
import { upload } from '~/utils/upload.ts';

import { Logger } from '~/utils/logger.ts';

const logger = new Logger('Input');

// Receive share event
export const useRecvShareEvent = () => {
    useEffect(() => {
        const subscribeBroadcast = () => {
            const broadcastChannel =
                'BroadcastChannel' in self
                    ? new BroadcastChannel(__CHANNEL__)
                    : null;
            if (!broadcastChannel) return void 0;
            broadcastChannel.addEventListener('message', (evt) => {
                logger.debug(`[Broadcast]: ${evt.data}`);
            });
            return () => {
                broadcastChannel.close();
            };
        };
        const read = async () => {
            logger.debug(`Received files detected ${location.search}`);
            const cache = await caches.open(__CACHE_NAME__);
            logger.debug(`Opened cache`);
            const requests = await cache.keys();
            logger.debug(`Total ${requests.length} items.`);
            for (const request of requests) {
                const response = await cache.match(request);
                if (!response) {
                    logger.warn(`Invalid cache item = "${request.url}"`);
                    continue;
                }
                logger.debug(`Processing... url = ${request.url}`);
                const blob = await response.blob();
                const filename =
                    response.headers.get('x-raw-filename') ||
                    new URL(request.url).pathname.slice(__PREFIX__.length + 21); // two `-`, 13-digits timestamp, 6-digits hex index
                const file = new File([blob], decodeURIComponent(filename), {
                    type:
                        blob.type ||
                        response.headers.get('content-type') ||
                        'application/octet-stream',
                    lastModified: new Date(
                        response.headers.get('last-modified') || Date.now(),
                    ).getTime(),
                });
                await upload({ type: 'multi-file', files: [file] });
                await cache.delete(request);
                logger.debug(`Deleted cache`);
            }
            const search = new URLSearchParams(location.search);
            search.delete('received');
            search.delete('t');
            search.delete('l');
            search.delete('keys');
            logger.debug(`All items processed`);
            const url = new URL(location.href);
            url.search = search.size === 0 ? '' : search.toString();
            window.history.replaceState(null, document.title, url);
        };
        if (location.search.includes('received')) {
            read().catch(logger.error);
        }
        return subscribeBroadcast();
    }, []);
};
