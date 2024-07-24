const __CACHE_NAME__ = 'media';
const __CHANNEL__ = 'messages';
const __PREFIX__ = '/shared_media/';

const broadcastChannel =
  'BroadcastChannel' in self ? new BroadcastChannel(__CHANNEL__) : null;

// This event is fired when a user has taken action in the browser to remove
// an item that was previously added to the content index.
// In Android Chrome, this is triggered by a deletion from the Downloads screen.

self.addEventListener('contentdelete', (event) => {
  const cacheKey = event.id;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(__CACHE_NAME__);
      await cache.delete(cacheKey);
    })()
  );
});
/**
 * @param message {string}
 */
const postMessage = (message) => {
  if (broadcastChannel) broadcastChannel.postMessage(message);
};
self.addEventListener('fetch', (fetchEvent) => {
  if (
    fetchEvent.request.url.endsWith('/receive-files') &&
    fetchEvent.request.method === 'POST'
  ) {
    postMessage('Saving media locally...');
    return fetchEvent.respondWith(
      (async () => {
        const formData = await fetchEvent.request.formData();
        const keys = [...formData.keys()].join(', ');
        const mediaFiles = formData.getAll('media');
        const cache = await caches.open(__CACHE_NAME__);
        const now = Date.now();
        for (const [i, mediaFile] of mediaFiles.entries()) {
          if (!mediaFile.name) {
            postMessage('Sorry! No name found on incoming media.');
            continue;
          }
          const cacheKey = new URL(
            `${__PREFIX__}${now}-${i
              .toString(16)
              .padStart(6, '0')}-${encodeURIComponent(mediaFile.name)}`,
            self.location
          ).href;
          await cache.put(
            cacheKey,
            new Response(mediaFile, {
              headers: {
                'content-length': mediaFile.size,
                'content-type': mediaFile.type,
                'last-modified': new Date(mediaFile.lastModified).toGMTString(),
                'x-raw-filename': encodeURIComponent(mediaFile.name)
              }
            })
          );
        }
        return Response.redirect(
          `/?received&t=${now}&l=${mediaFiles.length}&keys=${keys}`,
          303
        );
      })()
    );
  }
});