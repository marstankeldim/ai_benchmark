/**
 * API server entry point. Reads `API_HOST` / `API_PORT` from the environment and
 * starts listening. For programmatic use (tests, embedding) import
 * {@link buildServer} from `./server.js` instead.
 */

import { loadEnv } from "@evalforge/shared";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildServer();
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  // eslint-disable-next-line no-console
  console.log(`⚒  EvalForge API listening on http://${env.API_HOST}:${env.API_PORT}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start API server:", error);
  process.exit(1);
});

export { buildServer } from "./server.js";
