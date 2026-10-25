import type { Queryable } from '../db/client.ts';

export interface AuditEntry {
  actorId: string | null;
  actorKind: 'admin' | 'system' | 'webhook';
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Writes an audit row inside the caller's transaction, so a change and its record commit or roll back together. */
export async function audit(q: Queryable, entry: AuditEntry): Promise<void> {
  await q.query(
    `insert into audit_log (actor_id, actor_kind, action, entity_type, entity_id, before_state, after_state)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorId,
      entry.actorKind,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}
