import { AsyncLocalStorage } from "async_hooks";

// PDDS Phase 3 — lets the Prisma middleware (see lib/prisma.ts) know WHO
// is making each write, without every single route handler needing to
// pass userId through manually. Set once per request in requireAuth,
// read automatically inside the Prisma middleware for every query that
// request triggers, however deep in the call stack.
interface RequestContext {
  userId: string;
  institutionId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getCurrentUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}
