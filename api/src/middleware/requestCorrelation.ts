import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// GAP-SEC-003 (Implementation Requirements Traceability & Remediation
// Register, 9 Aug 2026) — "request correlation" piece. Every request
// gets a real ID, set as early as possible in the middleware chain, so
// a single request can be traced through logs/error responses/audit
// entries even across the async boundaries a real request touches
// (multiple DB calls, sometimes multiple services). Respects an
// upstream-supplied X-Request-Id if one already exists (e.g. from a
// future gateway/load balancer) rather than always minting a fresh one,
// so correlation survives across hops instead of resetting at this
// service's edge.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestCorrelation(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  req.requestId = (typeof incoming === "string" && incoming.length > 0 && incoming.length < 200) ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
