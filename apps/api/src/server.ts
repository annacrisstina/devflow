import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);

// Graceful shutdown: stop accepting connections, let in-flight requests
// finish, then close the db pool (onClose hook). `once` so a second signal
// kills the process the hard way instead of queueing another drain.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        app.log.error({ err: error }, 'shutdown failed');
        process.exit(1);
      });
  });
}

await app.listen({ host: config.host, port: config.port });
