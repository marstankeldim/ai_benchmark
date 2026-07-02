/**
 * Prisma client singleton. A single `PrismaClient` per process avoids exhausting
 * the connection pool during hot-reload; production code should pass its own
 * instance to {@link PrismaRunStore} for lifecycle control.
 */

import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export { PrismaClient };
