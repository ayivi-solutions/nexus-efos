import { Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./auth";

// GAP-API-001. See the IdempotencyKey schema comment for the full
// reasoning. Opt-in via the Idempotency-Key request header — a client
// that doesn't send it sees no behavior change at all, so this can be
// applied to existing endpoints without breaking anyone not yet using
// it. Must run after requireAuth (needs req.auth) and after the JSON
// body parser (needs req.body for the request-hash check).
export function idempotent(req: AuthedRequest, res: Response, next: NextFunction) {
  const key = req.headers["idempotency-key"];
  if (!key || typeof key !== "string") return next();

  const requestHash = crypto.createHash("sha256").update(JSON.stringify(req.body || {})).digest("hex");
  const institutionId = req.auth!.institutionId;
  const userId = req.auth!.userId;
  const endpoint = req.originalUrl;

  (async () => {
    // Atomic claim, not check-then-act — the same discipline as every
    // other concurrency fix tonight. Two concurrent requests bearing the
    // same key can't both get past this: the unique constraint means
    // only one INSERT can ever succeed, so only one can actually run the
    // real handler below.
    let claim;
    try {
      claim = await prisma.idempotencyKey.create({
        data: { institutionId, userId, endpoint, key, requestHash },
      });
    } catch (err: any) {
      if (err.code !== "P2002") throw err; // not a duplicate-key collision — a genuine unexpected error, let it propagate

      const existing = await prisma.idempotencyKey.findUnique({
        where: { institutionId_userId_endpoint_key: { institutionId, userId, endpoint, key } },
      });
      if (!existing) throw err; // raced with the row being deleted somehow — vanishingly unlikely, fall through to the generic error handler

      if (existing.requestHash !== requestHash) {
        return res.status(409).json({ error: "This idempotency key was already used for a request with a different body — use a new key for a genuinely different request." });
      }
      if (existing.responseStatus === null) {
        // The original request that claimed this key hasn't finished
        // yet — a true concurrent replay, not a completed one. Correct
        // to reject rather than block-and-wait; the client that sent
        // the original request will get the real answer when it
        // completes, and Idempotency-Key headers are meant to be reused
        // for exact retries, not simultaneous duplicate submissions.
        return res.status(409).json({ error: "A request with this idempotency key is already in progress." });
      }
      // A genuinely completed prior request with the same key and the
      // same body — this is the actual replay case the whole mechanism
      // exists for. Return exactly what was returned the first time,
      // without running the handler (and its real financial effect)
      // again.
      return res.status(existing.responseStatus).json(existing.responseBody as any);
    }

    // Won the claim — proceed to the real handler, but capture whatever
    // it eventually sends so a future replay of this exact key can be
    // answered from here without re-executing anything.
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      prisma.idempotencyKey
        .update({ where: { id: claim.id }, data: { responseStatus: res.statusCode, responseBody: body, completedAt: new Date() } })
        .catch((err: any) => console.error("[idempotency] failed to store response:", err));
      return originalJson(body);
    }) as typeof res.json;

    next();
  })().catch(next);
}
