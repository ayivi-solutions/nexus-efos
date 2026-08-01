import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUserId } from "./requestContext";

// Singleton pattern — avoids exhausting DB connections on hot reload.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// PDDS Phase 3 (§13.4 mandatory audit columns) — auto-populates
// created_by/updated_by/version_no on every create/update, for every
// model, without any individual route handler needing to set them.
// record_status is kept in sync automatically whenever a call's own data
// sets `archived` or `deletedAt`, so it never needs a second, independently-
// maintained field that could drift out of sync with those.
//
// Deliberately NOT covered here (see build log): optimistic-locking
// CONFLICT REJECTION. version_no increments correctly on every update, but
// nothing yet compares an incoming request's expected version against the
// current one before applying — that needs the frontend to load and submit
// a version, which is separate, larger work.
prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<any>) => {
  const userId = getCurrentUserId();

  if (params.action === "create" && userId) {
    params.args.data = { ...params.args.data, createdById: userId, updatedById: userId };
  }

  if (params.action === "update" || params.action === "updateMany") {
    params.args.data = { ...params.args.data, versionNo: { increment: 1 } };
    if (userId) {
      params.args.data = { ...params.args.data, updatedById: userId };
    }
    if (params.args.data?.archived === true) {
      params.args.data.recordStatus = "ARCHIVED";
    }
    if (params.args.data?.deletedAt) {
      params.args.data.recordStatus = "DELETED";
      if (userId && !params.args.data.deletedById) {
        params.args.data.deletedById = userId;
      }
    }
  }

  if (params.action === "upsert" && userId) {
    if (params.args.create) {
      params.args.create = { ...params.args.create, createdById: userId, updatedById: userId };
    }
    if (params.args.update) {
      params.args.update = { ...params.args.update, updatedById: userId, versionNo: { increment: 1 } };
    }
  }

  return next(params);
});
