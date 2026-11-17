import type { Request } from "express";
import { AuditLog } from "./mongodb";

export type AuditEntity = "order" | "booking" | "product";

/**
 * Records a staff action. Never throws: a failed audit write is logged but
 * must not undo a change that already succeeded.
 */
export async function recordAudit(
  req: Request,
  entry: { action: string; entity: AuditEntity; entityRef: string; summary: string; changes?: Record<string, unknown> },
): Promise<void> {
  try {
    await AuditLog.create({ ...entry, actorId: req.auth!.id, actorEmail: req.auth!.email });
  } catch (e) {
    console.error(`[audit] failed to record ${entry.action} on ${entry.entity} ${entry.entityRef}:`, e);
  }
}
