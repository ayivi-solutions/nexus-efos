import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../lib/jwt";
import { requestContext } from "../lib/requestContext";

export interface AuthedRequest extends Request {
  auth?: AccessTokenPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    req.auth = verifyAccessToken(token);
    // PDDS Phase 3 — everything downstream (every Prisma call this
    // request triggers, at any depth) can now see who's making it,
    // without threading userId through every function signature.
    requestContext.run({ userId: req.auth.userId, institutionId: req.auth.institutionId }, () => {
      next();
    });
  } catch {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }
}
