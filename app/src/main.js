// Boot. Keep this thin: wire the app together, nothing else.
import { startRouter } from './core/router.js';

startRouter();

// TODO(next): swap store.js to the real localStorage-backed reads (data/schema.js),
// register the service worker for offline/PWA, and init cloud sync (data/sync.js).
