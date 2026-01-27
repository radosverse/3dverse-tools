/**
 * Service Worker for PBR Texture Generator.
 * Provides offline caching for static assets.
 * Also adds COOP/COEP headers to enable SharedArrayBuffer for ONNX Runtime.
 */

const CACHE_NAME = 'pbr-texture-gen-v2';

// COOP/COEP headers required for SharedArrayBuffer (ONNX WASM threads)
const CORP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
];

// Install event - precache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching core assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
// Also injects COOP/COEP headers for SharedArrayBuffer support
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests
  if (url.pathname.startsWith('/api/')) return;

  // Handle cross-origin requests - pass through but mark as cross-origin
  if (url.origin !== self.location.origin) {
    // For cross-origin, just pass through
    return;
  }

  // For model files, use cache-first strategy with COOP/COEP headers
  if (url.pathname.includes('/models/')) {
    event.respondWith(withCoopCoep(cacheFirst(event.request)));
    return;
  }

  // For static assets, use stale-while-revalidate with COOP/COEP headers
  if (isStaticAsset(url.pathname)) {
    event.respondWith(withCoopCoep(staleWhileRevalidate(event.request)));
    return;
  }

  // For HTML and other requests, use network-first with COOP/COEP headers
  event.respondWith(withCoopCoep(networkFirst(event.request)));
});

/**
 * Add COOP/COEP headers to response for SharedArrayBuffer support.
 * Required for ONNX Runtime WASM with threading.
 */
async function withCoopCoep(responsePromise) {
  const response = await responsePromise;
  if (!response) return response;

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
  newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Cache-first strategy
 * Good for large static assets like models
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('[SW] Cache hit:', request.url);
    return cached;
  }

  console.log('[SW] Cache miss, fetching:', request.url);
  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }

  return response;
}

/**
 * Network-first strategy
 * Good for HTML and dynamic content
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] Network failed, falling back to cache:', request.url);
    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    // Return offline page if available
    if (request.mode === 'navigate') {
      return caches.match('/');
    }

    throw error;
  }
}

/**
 * Stale-while-revalidate strategy
 * Good for static assets that change occasionally
 */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      const cache = caches.open(CACHE_NAME);
      cache.then((c) => c.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise;
}

/**
 * Check if a path is a static asset
 */
function isStaticAsset(pathname) {
  const staticExtensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
  return staticExtensions.some((ext) => pathname.endsWith(ext));
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});
