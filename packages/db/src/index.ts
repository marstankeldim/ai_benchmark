/**
 * @evalforge/db — the Postgres persistence backend.
 *
 * `PrismaRunStore` implements the engine's `RunStore` port against the schema in
 * `prisma/schema.prisma`. Because it satisfies the same interface as the in-memory
 * and filesystem stores, the engine and API adopt Postgres by construction alone:
 *
 *   const engine = createEngine({ store: new PrismaRunStore() });
 *
 * Run `npm run db:generate` (client) and `npm run db:migrate` (schema) first.
 */

export * from "./client.js";
export * from "./mappers.js";
export * from "./prisma-store.js";
