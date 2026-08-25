/**
 * Local NuMail ledger.
 *
 * The NuMail pallet (Module 13) is not deployed on every node an operator may
 * point this client at. When `api.tx.numail` is unavailable we fall back to a
 * deterministic local ledger so the whole UI (folders, delivery state,
 * blocklists, threads) remains exercisable. Every mutation mirrors the shape of
 * the real extrinsic so swapping in the pallet is a one-line change per action.
 */
import {
  CONSTANTS,
  DEFAULT_FOLDERS,
  type Attachment,
  type DeliveryState,
  type MailEnvelope,
  type Mailbox,
  type MailboxPolicy,
  type NumailEvent,
} from "./types";

const KEY = "numail_local_ledger_v1";

export interface LedgerState {
  block: number;
  mailboxes: Record<string, Mailbox>;
  mail: Record<string, MailEnvelope>;
  delivery: DeliveryState[];
  blocklists: Record<string, string[]>;
  /** off-chain encrypted payload store (subject/body plaintext for this device) */
  payloads: Record<string, { subject: string; body: string }>;
  events: NumailEvent[];
}

const empty = (): LedgerState => ({
  block: 1_284_000,
  mailboxes: {},
  mail: {},
  delivery: [],
  blocklists: {},
  payloads: {},
  events: [],
});

export function loadLedger(): LedgerState {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...(JSON.parse(raw) as LedgerState) };
  } catch {
    return empty();
  }
}

export function saveLedger(state: LedgerState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetLedger() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}

export function shortHash(input: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    h1 = (h1 ^ input.charCodeAt(i)) >>> 0;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = (h2 + h1 * (i + 7)) >>> 0;
  }
  return `0x${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function blockToDate(block: number, headBlock: number, now = Date.now()) {
  return new Date(now - (headBlock - block) * CONSTANTS.BlockTimeSeconds * 1000);
}

function pushEvent(state: LedgerState, event: Omit<NumailEvent, "id" | "timestamp">) {
  state.events.unshift({
    ...event,
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: Date.now(),
  });
  state.events = state.events.slice(0, 100);
}

export class LedgerError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const ledgerOps = {
  createMailbox(
    state: LedgerState,
    owner: string,
    policy: MailboxPolicy,
    retention: number | undefined,
    folders: string[],
  ) {
    if (state.mailboxes[owner]) throw new LedgerError("MailboxAlreadyExists");
    const all = Array.from(new Set([...DEFAULT_FOLDERS, ...folders])).slice(0, CONSTANTS.MaxFolders);
    state.block += 1;
    state.mailboxes[owner] = {
      owner,
      policy,
      retention,
      folders: all,
      createdAtBlock: state.block,
      createdAt: Date.now(),
    };
    state.blocklists[owner] ??= [];
    pushEvent(state, { type: "MailboxCreated", account: owner, detail: "Mailbox created on chain" });
    return state.mailboxes[owner];
  },

  setPolicy(state: LedgerState, owner: string, policy: MailboxPolicy, retention?: number) {
    const mb = state.mailboxes[owner];
    if (!mb) throw new LedgerError("MailboxNotFound");
    mb.policy = policy;
    mb.retention = retention;
    state.block += 1;
    pushEvent(state, { type: "PolicyUpdated", account: owner, detail: `Policy set to ${policy.kind}` });
  },

  addFolder(state: LedgerState, owner: string, folder: string) {
    const mb = state.mailboxes[owner];
    if (!mb) throw new LedgerError("MailboxNotFound");
    if (mb.folders.length >= CONSTANTS.MaxFolders) throw new LedgerError("FolderFull");
    if (!mb.folders.includes(folder)) mb.folders.push(folder);
  },

  sendMail(
    state: LedgerState,
    sender: string,
    input: {
      recipients: string[];
      subject: string;
      body: string;
      attachments: Attachment[];
      threadParent?: string | undefined;
      postage?: number | undefined;
    },
  ) {
    if (input.recipients.length === 0) throw new LedgerError("NoRecipients");
    if (input.recipients.length > CONSTANTS.MaxRecipients) throw new LedgerError("TooManyRecipients");
    if (input.attachments.length > CONSTANTS.MaxAttachments) throw new LedgerError("TooManyAttachments");
    if (input.attachments.some((a) => !a.anchored)) throw new LedgerError("AttachmentNotAnchored");

    for (const r of input.recipients) {
      const mb = state.mailboxes[r];
      if (!mb) throw new LedgerError("MailboxNotFound");
      if ((state.blocklists[r] ?? []).includes(sender)) throw new LedgerError("SenderBlocked");
      if (mb.policy.kind === "PostageRequired" && (input.postage ?? 0) < (mb.policy.postage ?? 0)) {
        throw new LedgerError("PostageRequired");
      }
      if (mb.policy.kind === "ContactsOnly") {
        const known = state.delivery.some(
          (d) => d.account === sender && state.mail[d.mailId]?.sender === r,
        );
        const selfSend = r === sender;
        if (!known && !selfSend) throw new LedgerError("PolicyRefused");
      }
    }

    state.block += 1;
    const mailId = `0x${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`;
    const envelope: MailEnvelope = {
      mailId,
      sender,
      recipients: input.recipients,
      subjectHash: shortHash(input.subject),
      bodyRef: shortHash(input.body),
      attachments: input.attachments,
      threadParent: input.threadParent,
      block: state.block,
      timestamp: Date.now(),
      postage: input.postage,
    };
    state.mail[mailId] = envelope;
    state.payloads[mailId] = { subject: input.subject, body: input.body };
    state.delivery.push({ mailId, account: sender, status: "Read", folder: "sent" });
    for (const r of input.recipients) {
      state.delivery.push({ mailId, account: r, status: "Delivered", folder: "inbox" });
    }
    pushEvent(state, { type: "MailSent", mailId, account: sender, detail: "Mail submitted" });
    pushEvent(state, {
      type: "MailDelivered",
      mailId,
      detail: `Delivered to ${input.recipients.length} recipient(s)`,
    });
    return envelope;
  },

  markRead(state: LedgerState, account: string, mailId: string) {
    const d = state.delivery.find((x) => x.mailId === mailId && x.account === account);
    if (!d) throw new LedgerError("MailNotFound");
    d.status = "Read";
    state.block += 1;
    pushEvent(state, { type: "MailRead", mailId, account, detail: "Marked as read" });
  },

  moveToFolder(state: LedgerState, account: string, mailId: string, folder: string) {
    const d = state.delivery.find((x) => x.mailId === mailId && x.account === account);
    if (!d) throw new LedgerError("MailNotFound");
    d.folder = folder;
    if (folder === "archive") d.status = "Archived";
    state.block += 1;
    pushEvent(state, { type: "MailMoved", mailId, account, detail: `Moved to ${folder}` });
  },

  tombstone(state: LedgerState, account: string, mailId: string) {
    const d = state.delivery.find((x) => x.mailId === mailId && x.account === account);
    if (!d) throw new LedgerError("MailNotFound");
    d.status = "Tombstoned";
    state.block += 1;
    pushEvent(state, { type: "MailTombstoned", mailId, account, detail: "Mail tombstoned" });
  },

  blockSender(state: LedgerState, owner: string, target: string) {
    const list = (state.blocklists[owner] ??= []);
    if (list.length >= CONSTANTS.MaxBlocklist) throw new LedgerError("BlocklistFull");
    if (!list.includes(target)) list.push(target);
    state.block += 1;
    pushEvent(state, { type: "SenderBlocked", account: target, detail: `${target} blocked` });
  },

  unblockSender(state: LedgerState, owner: string, target: string) {
    state.blocklists[owner] = (state.blocklists[owner] ?? []).filter((a) => a !== target);
    state.block += 1;
    pushEvent(state, { type: "SenderUnblocked", account: target, detail: `${target} unblocked` });
  },
};

/** Seeds a couple of correspondents + demo mail so the UI is never empty. */
export function seedDemoData(state: LedgerState, owner: string) {
  const alice = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
  const bob = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";
  for (const [addr, policy] of [
    [alice, { kind: "Open" } as MailboxPolicy],
    [bob, { kind: "PostageRequired", postage: 500 } as MailboxPolicy],
  ] as const) {
    if (!state.mailboxes[addr]) {
      state.mailboxes[addr] = {
        owner: addr,
        policy,
        folders: DEFAULT_FOLDERS,
        createdAtBlock: state.block - 5000,
        createdAt: Date.now() - 5000 * 6000,
      };
      state.blocklists[addr] = [];
    }
  }
  const already = state.delivery.some((d) => d.account === owner && d.folder === "inbox");
  if (already) return;

  const first = ledgerOps.sendMail(state, alice, {
    recipients: [owner],
    subject: "Welcome to NuMail",
    body:
      "Hi there,\n\nThis is an on-chain letter. The envelope (sender, recipients, subject hash, body reference) lives on the Polkadot chain, while the plaintext you're reading is decrypted locally by your client.\n\n— Alice",
    attachments: [],
  });
  ledgerOps.sendMail(state, bob, {
    recipients: [owner],
    subject: "Quarterly attestation bundle",
    body:
      "Attaching the anchored bundle for review. The attachment is referenced by its DNC anchor, not stored on chain.",
    attachments: [{ name: "attestation-q3.pdf", size: 244_112, cid: shortHash("attestation"), anchored: true }],
    threadParent: undefined,
  });
  ledgerOps.sendMail(state, alice, {
    recipients: [owner],
    subject: "Re: Welcome to NuMail",
    body: "Following up in the same thread — replies keep the thread_parent link so conversations stay intact.",
    attachments: [],
    threadParent: first.mailId,
  });
}
