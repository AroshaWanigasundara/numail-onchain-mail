import type { ArchivedItem } from "./archive";
import type { LedgerState } from "./ledger";
import type { DeliveryState, MailEnvelope } from "./types";

export interface MailRow {
  delivery: DeliveryState;
  mail: MailEnvelope;
  /** set when the row comes from a named archive folder (.pst) */
  archived?: { archiveId: string; item: ArchivedItem; onChain: boolean };
}

/** Live payload first; archived snapshot as fallback (covers mail that is only in the .pst). */
export const payloadFor = (ledger: LedgerState, row: MailRow) =>
  ledger.payloads[row.mail.mailId] ??
  (row.archived ? { subject: row.archived.item.subject, body: row.archived.item.body } : undefined);

/* ---------------------------------------------------------------- thread identity */

const MAX_HOPS = 32;

/** Root of a conversation: follow thread_parent upwards (cycle-safe). */
export function threadRootId(mail: MailEnvelope, mails: Record<string, MailEnvelope>): string {
  let current = mail;
  const seen = new Set<string>([current.mailId]);
  for (let i = 0; i < MAX_HOPS; i++) {
    const parentId = current.threadParent;
    if (!parentId) return current.mailId;
    const parent = mails[parentId];
    if (!parent) return parentId; // parent not visible to us — still a stable key
    if (seen.has(parent.mailId)) return current.mailId;
    seen.add(parent.mailId);
    current = parent;
  }
  return current.mailId;
}

const byAge = (a: MailRow, b: MailRow) =>
  a.mail.block - b.mail.block || Number(a.mail.mailId) - Number(b.mail.mailId);

/** Every visible (not tombstoned) message of one thread, across all folders, oldest first. */
export function messagesOfThread(
  key: string,
  mails: Record<string, MailEnvelope>,
  deliveries: DeliveryState[],
  me: string,
): MailRow[] {
  const out: MailRow[] = [];
  for (const d of deliveries) {
    if (d.account !== me || d.status === "Tombstoned") continue;
    const mail = mails[d.mailId];
    if (mail && threadRootId(mail, mails) === key) out.push({ delivery: d, mail });
  }
  return out.sort(byAge);
}

/* ---------------------------------------------------------------- list grouping */

export interface Conversation<R extends MailRow> {
  key: string;
  /** messages of this conversation that live in the folder being listed */
  rows: R[];
  /** newest message in the listed folder */
  latest: R;
  /** total visible messages in the thread, across folders */
  count: number;
  unread: number;
  hasAttachments: boolean;
  /** everyone in the thread except me, newest activity first */
  participants: string[];
}

export function groupConversations<R extends MailRow>(
  rows: R[],
  mails: Record<string, MailEnvelope>,
  deliveries: DeliveryState[],
  me: string,
  group = true,
): Conversation<R>[] {
  const visible = new Map<string, MailRow[]>();
  if (group) {
    for (const d of deliveries) {
      if (d.account !== me || d.status === "Tombstoned") continue;
      const mail = mails[d.mailId];
      if (!mail) continue;
      const key = threadRootId(mail, mails);
      const list = visible.get(key);
      if (list) list.push({ delivery: d, mail });
      else visible.set(key, [{ delivery: d, mail }]);
    }
  }

  const byKey = new Map<string, R[]>();
  for (const row of rows) {
    const key = group ? threadRootId(row.mail, mails) : row.mail.mailId;
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const out: Conversation<R>[] = [];
  for (const [key, listed] of byKey) {
    const sortedRows = [...listed].sort(byAge);
    const latest = sortedRows[sortedRows.length - 1]!;
    const all = [...(visible.get(key) ?? listed)].sort(byAge);

    const seen = new Set<string>();
    const participants: string[] = [];
    for (const { mail } of [...all].reverse()) {
      for (const a of [mail.sender, ...mail.recipients]) {
        if (a !== me && !seen.has(a)) {
          seen.add(a);
          participants.push(a);
        }
      }
    }
    out.push({
      key,
      rows: sortedRows,
      latest,
      count: all.length,
      unread: all.filter((r) => r.delivery.status === "Delivered").length,
      hasAttachments: all.some((r) => r.mail.attachments.length > 0),
      participants,
    });
  }
  return out.sort(
    (a, b) => b.latest.mail.block - a.latest.mail.block || Number(b.latest.mail.mailId) - Number(a.latest.mail.mailId),
  );
}

/* ---------------------------------------------------------------- text + reply helpers */

export const normalizeSubject = (s: string) => s.replace(/^(\s*(re|fwd?)\s*:\s*)+/i, "").trim() || s;

export const replySubject = (s: string) => `Re: ${normalizeSubject(s)}`;

export const previewOf = (body?: string) => (body ? body.replace(/\s+/g, " ").trim().slice(0, 110) : "");

/**
 * Reply: back to the sender (for my own message: to its recipients).
 * Reply all: sender + everyone else on the mail, minus me.
 */
export function replyRecipients(mail: MailEnvelope, me: string, all: boolean): string[] {
  const others = mail.recipients.filter((a) => a !== me);
  const list =
    mail.sender === me
      ? others
      : all
        ? [mail.sender, ...others]
        : [mail.sender];
  const unique = Array.from(new Set(list));
  return unique.length > 0 ? unique : [mail.sender];
}
