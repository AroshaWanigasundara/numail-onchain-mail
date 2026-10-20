import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  DEFAULT_FOLDERS,
  DEFAULT_ENDPOINT,
  ENDPOINT_STORAGE_KEY,
  PALLET_ERRORS,
  type Attachment,
  type MailboxPolicy,
  type DeliveryStatus,
} from "./types";
import {
  LedgerError,
  ledgerOps,
  loadLedger,
  saveLedger,
  seedDemoData,
  type LedgerState,
} from "./ledger";
import {
  encodeAttachments,
  encodePolicy,
  hasCall,
  hasPallet,
  mailIdFromEvents,
  submitExtrinsic,
  submitSystemNotice,
  type AnyApi,
} from "./chain";
import { devAccount, type DevAccountName } from "./devAccounts";
import {
  bytesToHex,
  chainPublicKeyToSpkiHex,
  decryptMailWithKey,
  encryptMailForRecipients,
  ensureKeyPair,
  hexToBytes,
  loadKeyPair,
  publicKeyPem,
  saveKeyPair,
  samePublicKey,
  type NumailKeyPair,
} from "./keys";
import {
  MAX_ARCHIVE_NAME,
  PstError,
  acquirePstSink,
  buildPst,
  canRestore,
  dropPstSink,
  hasPstSink,
  loadArchives,
  newArchiveId,
  readPst,
  saveArchives,
  type ArchiveFolder,
  type ArchivedItem,
} from "./archive";

import { validateDisplayName } from "./names";

export type ConnStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface WalletAccount {
  address: string;
  name: string;
  source: string;
  /** set for Substrate dev keyring accounts (//Alice etc.) — enables keypair signing */
  devName?: string | undefined;
}

interface NumailContextValue {
  // connection
  endpoint: string | null;
  status: ConnStatus;
  connError: string | null;
  chainName: string | null;
  lastConnectedAt: number | null;
  palletAvailable: boolean;
  /** true when actions submit real extrinsics instead of the local simulation */
  onChain: boolean;
  setEndpoint: (url: string) => void;
  reconnect: () => void;
  testEndpoint: (url: string) => Promise<{ ok: boolean; message: string }>;

  // wallet
  accounts: WalletAccount[];
  account: WalletAccount | null;
  walletError: string | null;
  connectWallet: () => Promise<void>;
  useDemoAccount: () => void;
  useDevAccount: (name: DevAccountName) => Promise<void>;
  selectAccount: (address: string) => void;
  disconnectWallet: () => void;
  balance: string | null;

  // ledger
  ledger: LedgerState;
  archives: ArchiveFolder[];
  directory: Record<string, string>;
  contacts: Record<string, string>;
  busy: string | null;
  actions: {
    createMailbox: (p: MailboxPolicy, retention: number | undefined, folders: string[]) => Promise<void>;
    setPolicy: (p: MailboxPolicy, retention: number | undefined) => Promise<void>;
    addFolder: (name: string) => Promise<void>;
    deleteFolder: (name: string) => Promise<void>;   // NEW
    importKey: (pair: NumailKeyPair) => Promise<void>;
    watchDeliveryStatuses: (
      mailId: string,
      recipients: string[],
      onUpdate: (statuses: Record<string, DeliveryStatus | null>) => void,
    ) => Promise<() => void>;
    sendMail: (input: {
      recipients: string[];
      subject: string;
      body: string;
      attachments: Attachment[];
      threadParent?: string | undefined;
      postage?: number | undefined;
    }) => Promise<string | null>;
        systemNotice: (input: {
      sender: string;
      recipients: string[];
      subject: string;
      body: string;
      threadParent?: string | undefined;
    }) => Promise<string | null>;
    markRead: (mailId: string) => Promise<void>;
    moveToFolder: (mailId: string, folder: string) => Promise<void>;
    archiveMail: (mailId: string, target: { archiveId: string } | { newName: string }) => Promise<void>;
    restoreArchived: (archiveId: string, mailId: string, folder: string) => Promise<void>;
    openPst: (file: File) => Promise<string>;
    savePst: (archiveId: string) => Promise<void>;
    closeArchive: (archiveId: string) => void;
    tombstone: (mailId: string) => Promise<void>;
    blockSender: (address: string) => Promise<void>;
    unblockSender: (address: string) => Promise<void>;
    resetChainData: () => void;
    setDisplayName: (name: string) => Promise<void>;
    clearDisplayName: () => Promise<void>;
    /** private nickname for an address (empty = remove) */
    setContact: (address: string, nickname: string) => void;
  };
}

const NumailContext = createContext<NumailContextValue | null>(null);

const DEMO_ACCOUNT: WalletAccount = {
  address: "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy",
  name: "Demo Account",
  source: "demo",
};

function humanError(code: string) {
  return PALLET_ERRORS[code] ?? code.replace(/([A-Z])/g, " $1").trim();
}

const folderToBytes = (name: string) => `0x${bytesToHex(new TextEncoder().encode(name))}`;

const DIRECTORY_CACHE_KEY = "numail_directory_v1";
const CONTACTS_KEY = "numail_contacts_v1:";


export function NumailProvider({ children }: { children: ReactNode }) {
  const [endpoint, setEndpointState] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [connError, setConnError] = useState<string | null>(null);
  const [chainName, setChainName] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null);
  const [palletAvailable, setPalletAvailable] = useState(false);

  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const [ledger, setLedger] = useState<LedgerState>(() => loadLedger());
  const [busy, setBusy] = useState<string | null>(null);

  const [archives, setArchives] = useState<ArchiveFolder[]>([]);
  const archivesRef = useRef<ArchiveFolder[]>([]);
  const ledgerRef = useRef<LedgerState>(ledger);
  ledgerRef.current = ledger;

  const commitArchives = useCallback((address: string, next: ArchiveFolder[]) => {
    archivesRef.current = next;
    setArchives(next);
    if (!saveArchives(address, next)) {
      toast.warning("Browser storage is full", {
        description: "Archive folders could not be cached in the browser. The .pst file is the only copy.",
      });
    }
  }, []);

  const accountAddress = account?.address;
  useEffect(() => {
    const next = accountAddress ? loadArchives(accountAddress) : [];
    archivesRef.current = next;
    setArchives(next);
  }, [accountAddress]);

  const [directory, setDirectory] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const contactsRef = useRef<Record<string, string>>({});

  // paint cached names immediately; the chain refreshes them right after connecting
  useEffect(() => {
    try {
      setDirectory(JSON.parse(window.localStorage.getItem(DIRECTORY_CACHE_KEY) ?? "{}") as Record<string, string>);
    } catch {
      /* ignore a corrupt cache */
    }
  }, []);

  useEffect(() => {
    let next: Record<string, string> = {};
    if (accountAddress) {
      try {
        next = JSON.parse(window.localStorage.getItem(CONTACTS_KEY + accountAddress) ?? "{}") as Record<string, string>;
      } catch {
        /* ignore */
      }
    }
    contactsRef.current = next;
    setContacts(next);
  }, [accountAddress]);

  const syncDirectory = useCallback(async () => {
    const api = apiRef.current as AnyApi;
    const q = api?.query?.nuMail ?? api?.query?.numail;
    if (!q?.displayNames?.entries) return; // node without display-name support
    try {
      const entries = await q.displayNames.entries();
      const next: Record<string, string> = {};
      for (const [key, value] of entries) {
        const address = key.args?.[0]?.toString?.();
        const inner = value?.isSome === false ? null : value?.isSome ? value.unwrap() : value;
        const hex = inner?.toHex?.();
        if (!address || typeof hex !== "string") continue;
        let text = "";
        for (let i = 2; i < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        next[address] = text;
      }
      setDirectory(next);
      window.localStorage.setItem(DIRECTORY_CACHE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("[numail] display-name sync failed", e);
    }
  }, []);

  useEffect(() => {
    if (status !== "connected" || !palletAvailable) return;
    void syncDirectory();
    const timer = setInterval(() => void syncDirectory(), 30_000);
    return () => clearInterval(timer);
  }, [status, palletAvailable, syncDirectory]);

  const headBlockNow = useCallback(async (): Promise<number> => {
    const api = apiRef.current;
    if (status === "connected" && palletAvailable && Boolean(account) && account?.source !== "demo") {
      try {
        const header = await api?.rpc?.chain?.getHeader?.();
        const n = Number(header?.number?.toString?.() ?? 0);
        if (n > 0) return n;
      } catch {
        /* fall back to the last synced block */
      }
    }
    return ledgerRef.current.block;
  }, [status, palletAvailable, account]);

  const apiRef = useRef<AnyApi>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hydrate saved endpoint only — the wallet session is intentionally NOT
  // restored, so every browser reload lands back on the connect screen.
  useEffect(() => {
    const saved = window.localStorage.getItem(ENDPOINT_STORAGE_KEY);
    setEndpointState(saved || DEFAULT_ENDPOINT);
    window.localStorage.removeItem("numail_account");
    setLedger(loadLedger());
  }, []);


  const persist = useCallback((updater: (draft: LedgerState) => void) => {
    setLedger((prev) => {
      const draft: LedgerState = JSON.parse(JSON.stringify(prev));
      updater(draft);
      saveLedger(draft);
      return draft;
    });
  }, []);

  // ---- connection ----------------------------------------------------------
  const connect = useCallback(
    async (url: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus("connecting");
      setConnError(null);
      try {
        if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("ws://") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
          throw new Error(
            "Insecure WebSocket (ws://) cannot be used from a secure (https://) page. Use a wss:// endpoint, or run the app on http://localhost.",
          );
        }
        const { ApiPromise, WsProvider } = await import("@polkadot/api");
        if (apiRef.current) {
          await apiRef.current.disconnect().catch(() => undefined);
          apiRef.current = null;
        }
        const provider = new WsProvider(url, false);
        await provider.connect();
        const api = await ApiPromise.create({ provider: provider as never, throwOnConnect: true, noInitWarn: true });
        apiRef.current = api;
        const chain = await api.rpc.system.chain();
        setChainName(chain.toString());
        setPalletAvailable(hasPallet(api));
        setStatus("connected");
        setLastConnectedAt(Date.now());
        retryRef.current = 0;

        api.on("disconnected", () => {
          setStatus("disconnected");
          toast.error("Disconnected from blockchain node", {
            description: "Extrinsic submission is paused until the connection is restored.",
          });
        });
        api.on("connected", () => {
          setStatus("connected");
          setLastConnectedAt(Date.now());
        });
        api.on("error", (e: unknown) => setConnError(String(e)));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setStatus("error");
        setConnError(
          message.includes("Mixed Content") || message.includes("Insecure WebSocket")
            ? "Insecure WebSocket (ws://) detected on a secure page (https://). Use a wss:// endpoint or run locally on http://localhost."
            : message,
        );
        retryRef.current += 1;
        const delay = Math.min(retryRef.current * 5000, 30000);
        timerRef.current = setTimeout(() => void connect(url), delay);
      }
    },
    [],
  );

  useEffect(() => {
    if (endpoint) void connect(endpoint);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [endpoint, connect]);

  const setEndpoint = useCallback((url: string) => {
    window.localStorage.setItem(ENDPOINT_STORAGE_KEY, url);
    retryRef.current = 0;
    setEndpointState(url);
  }, []);

  const reconnect = useCallback(() => {
    if (endpoint) void connect(endpoint);
  }, [endpoint, connect]);

  const testEndpoint = useCallback(async (url: string) => {
    if (!/^wss?:\/\//.test(url)) {
      return { ok: false, message: "Endpoint must start with ws:// or wss://" };
    }
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      url.startsWith("ws://") &&
      !url.includes("localhost") &&
      !url.includes("127.0.0.1")
    ) {
      return {
        ok: false,
        message:
          "Insecure ws:// endpoint on an https:// page. Browsers block this. Use wss:// or open the app on http://localhost.",
      };
    }
    try {
      const { ApiPromise, WsProvider } = await import("@polkadot/api");
      const provider = new WsProvider(url, false);
      await provider.connect();
      const api = await ApiPromise.create({ provider: provider as never, throwOnConnect: true, noInitWarn: true });
      const chain = await api.rpc.system.chain();
      const hasPalletDetected = hasPallet(api);
      await api.disconnect();
      return {
        ok: true,
        message: `Connected to ${chain.toString()}${hasPalletDetected ? " — pallet-nuMail detected" : " — pallet-nuMail not found on this node"}`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  // ---- wallet --------------------------------------------------------------

  /**
   * Looks the connected address up in `nuMail.mailboxes` on chain and mirrors
   * the result into the local read-model, so a wallet that already owns a
   * mailbox lands straight in the mailbox instead of the create screen.
   */
  const syncMailboxFromChain = useCallback(
    async (address: string) => {
      const api = apiRef.current as AnyApi;
      const q = api?.query?.nuMail ?? api?.query?.numail;
      if (!q?.mailboxes) return false;
      try {
        const raw = await q.mailboxes(address);
        const some = typeof raw?.isSome === "boolean" ? raw.isSome : !raw?.isEmpty;
        if (!some) {
          // chain is the source of truth for real signers
          persist((draft) => {
            delete draft.mailboxes[address];
          });
          return false;
        }
        const value = raw.unwrapOr ? raw.unwrapOr(raw) : raw;
        const j = (value?.toJSON?.() ?? {}) as Record<string, unknown>;
        const hexToStr = (v: unknown) => {
          const s = String(v);
          if (!s.startsWith("0x")) return s;
          let out = "";
          for (let i = 2; i < s.length; i += 2) out += String.fromCharCode(parseInt(s.slice(i, i + 2), 16));
          return out;
        };
        const folders = Array.isArray(j["folders"]) ? (j["folders"] as unknown[]).map(hexToStr) : [];
        const rawPolicy = j["policy"];
        let policy: MailboxPolicy = { kind: "Open" };
        if (typeof rawPolicy === "string") {
          policy = { kind: /contacts/i.test(rawPolicy) ? "ContactsOnly" : "Open" };
        } else if (rawPolicy && typeof rawPolicy === "object") {
          const [k, v] = Object.entries(rawPolicy as Record<string, unknown>)[0] ?? [];
          if (k && /minTrust/i.test(k)) policy = { kind: "MinTrustScore", minTrustScore: Number(v) || 0 };
          else if (k && /postage/i.test(k)) policy = { kind: "PostageRequired", postage: Number(v) || 0 };
          else if (k && /contacts/i.test(k)) policy = { kind: "ContactsOnly" };
        }
        const retentionRaw = j["retentionBlocks"] ?? j["retention_blocks"];
        persist((draft) => {
          const existing = draft.mailboxes[address];
          draft.mailboxes[address] = {
            owner: address,
            policy,
            retention: retentionRaw == null ? undefined : Number(retentionRaw),
            folders: folders.length ? folders : (existing?.folders ?? ["inbox", "sent", "archive"]),
            createdAtBlock: existing?.createdAtBlock ?? draft.block,
            createdAt: existing?.createdAt ?? Date.now(),
          };
          draft.blocklists[address] ??= [];
        });
        return true;
      } catch {
        return false;
      }
    },
    [persist],
  );

  /** Replace the active account's local mail view with the current chain state. */
  const syncMailFromChain = useCallback(
    async (address: string) => {
      const api = apiRef.current as AnyApi;
      const q = api?.query?.nuMail ?? api?.query?.numail;
      if (!q?.mailItems?.entries || !q?.deliveryState || !q?.mailFolderOf) return false;

      try {
        const [entries, header] = await Promise.all([
          q.mailItems.entries(),
          api.rpc?.chain?.getHeader ? api.rpc.chain.getHeader() : Promise.resolve(null),
        ]);
        const chainMail: LedgerState["mail"] = {};
        const chainDelivery: LedgerState["delivery"] = [];
        const decrypted: Record<string, string> = {};
        const decryptedSubjects: Record<string, string> = {};
        const myKeys = loadKeyPair(address);

        for (const [key, raw] of entries as [AnyApi, AnyApi][]) {
          const mailId = key.args?.[0]?.toString?.();
          if (!mailId) continue;
          const value = typeof raw?.isSome === "boolean" ? (raw.isSome ? raw.unwrap() : null) : raw;
          if (!value) continue;
          const json = (value.toJSON?.() ?? {}) as Record<string, unknown>;
          const sender = String(json["sender"] ?? "");
          const recipients = Array.isArray(json["recipients"])
            ? (json["recipients"] as unknown[]).map(String)
            : [];
          const outgoing = sender === address;
          // When the sender wraps a copy of the AES key for themselves (see
          // sendMail below), their own address ends up in the on-chain
          // `recipients` list too, purely so encryptedKeys.len() matches
          // recipients.len(). Treat that case as outgoing only, so the mail
          // shows once in Sent, not a second time in Inbox.
          const incoming = !outgoing && recipients.includes(address);
          if (!outgoing && !incoming) continue;

          const attachmentHashes = Array.isArray(json["attachments"])
            ? (json["attachments"] as unknown[]).map(String)
            : [];
          const threadParentRaw = json["threadParent"] ?? json["thread_parent"];
          const createdAt = Number(json["createdAt"] ?? json["created_at"] ?? 0);
          
          // The envelope in MailItems is permanent evidence, so it must not decide visibility.
          // The sender's own copy has a DeliveryState entry too; once retention tombstones it,
          // the mail has to leave the Sent list (and we skip decrypting it).
          if (outgoing) {
            const own = await q.deliveryState(Number(mailId), address);
            const ownValue = typeof own?.isSome === "boolean" ? (own.isSome ? own.unwrap() : null) : own;
            if (ownValue && /tombstone/i.test(ownValue.toString?.() ?? "")) continue;
          }

          chainMail[mailId] = {
            mailId,
            sender,
            recipients,
            subjectHash: String(json["subjectHash"] ?? json["subject_hash"] ?? ""),
            bodyRef: String(json["bodyRef"] ?? json["body_ref"] ?? ""),
            attachments: attachmentHashes.map((cid, index) => ({
              name: `On-chain attachment ${index + 1}`,
              size: 0,
              cid,
              anchored: true,
            })),
            threadParent: threadParentRaw == null ? undefined : String(threadParentRaw),
            block: createdAt,
            timestamp: Date.now(),
          };

          // Hybrid decryption: unwrap this account's AES key, then the body.
          // The chain stores the base64 body and hex key as UTF-8 bytes and
          // returns them as hex text or a byte array — decode back to the
          // original text characters before decrypting.
          const toText = (v: unknown): string => {
            if (typeof v === "string") {
              const hex = v.startsWith("0x") ? v.slice(2) : v;
              if (/^[0-9a-fA-F]*$/.test(hex) && hex.length % 2 === 0 && hex.length > 0) {
                try {
                  return new TextDecoder().decode(hexToBytes(hex));
                } catch {
                  return v;
                }
              }
              return v;
            }
            if (Array.isArray(v)) return new TextDecoder().decode(Uint8Array.from(v.map(Number)));
            return "";
          };
          const encryptedBody = toText(json["encryptedBody"] ?? json["encrypted_body"]);
          const encryptedSubject = toText(json["encryptedSubject"] ?? json["encrypted_subject"]);
          // Sent mail is decrypted the same way as received mail: the sender's
          // own wrapped AES key is stored under their own address (see
          // sendMail below), so mailEncryptedKeys(mailId, address) resolves
          // for outgoing mail too.
          if ((incoming || outgoing) && myKeys && encryptedBody) {
            try {
              // Step 1: read this recipient's wrapped AES key from the
              // dedicated storage map mailEncryptedKeys(mailId, account).
              let wrapped = "";
              if (q.mailEncryptedKeys) {
                const keyRaw = await q.mailEncryptedKeys(Number(mailId), address);
                const keyValue =
                  typeof keyRaw?.isSome === "boolean" ? (keyRaw.isSome ? keyRaw.unwrap() : null) : keyRaw;
                if (keyValue) {
                  // Bytes on chain hold the hex text as UTF-8; turn it back into text.
                  wrapped = toText(keyValue.toHex?.() ?? keyValue.toJSON?.() ?? keyValue.toString?.());
                }
              }
              // Fallback: older pallets that keep the keys inside the envelope.
              if (!wrapped) {
                const encryptedKeysRaw = (json["encryptedKeys"] ?? json["encrypted_keys"]) as unknown;
                if (Array.isArray(encryptedKeysRaw)) {
                  const entry = (encryptedKeysRaw as unknown[]).find(
                    (pair) => Array.isArray(pair) && String((pair as unknown[])[0]) === address,
                  ) as unknown[] | undefined;
                  wrapped = entry ? toText(entry[1]) : "";
                }
              }
              if (!wrapped) throw new Error("No encrypted key found on chain for this account");
              // Steps 2-4: RSA-unwrap the AES key with the local private key once,
              // then AES-decrypt both the subject and the body with it.
              const mail = await decryptMailWithKey(encryptedSubject, encryptedBody, wrapped, myKeys.privateKeyBase64);
              decrypted[mailId] = mail.body;
              if (mail.subject) decryptedSubjects[mailId] = mail.subject;
            } catch (e) {
              console.error("[numail] could not decrypt mail", mailId, e);
            }
          } else if (incoming || outgoing) {
            console.warn("[numail] skipped decrypt", mailId, { hasLocalKey: !!myKeys, bodyLen: encryptedBody.length });
          }

          if (outgoing) {
            chainDelivery.push({ mailId, account: address, status: "Read", folder: "sent" });
          } else if (incoming) {
            const [deliveryRaw, folderRaw] = await Promise.all([
              q.deliveryState(Number(mailId), address),
              q.mailFolderOf(address, Number(mailId)),
            ]);
            const hasDelivery =
              typeof deliveryRaw?.isSome === "boolean" ? deliveryRaw.isSome : !deliveryRaw?.isEmpty;
            if (!hasDelivery) continue;
            const deliveryValue = deliveryRaw.unwrapOr ? deliveryRaw.unwrapOr(deliveryRaw) : deliveryRaw;
            const folderValue = folderRaw?.unwrapOr ? folderRaw.unwrapOr(folderRaw) : folderRaw;
            const statusValue = deliveryValue?.toString?.() ?? String(deliveryValue);
            const folderValueText = folderValue?.toUtf8?.() ?? folderValue?.toString?.() ?? "inbox";
            const deliveryStatus = /tombstone/i.test(statusValue)
              ? "Tombstoned"
              : /archive/i.test(statusValue)
                ? "Archived"
                : /read/i.test(statusValue)
                  ? "Read"
                  : "Delivered";
            chainDelivery.push({ mailId, account: address, status: deliveryStatus, folder: folderValueText });
          }
        }

        persist((draft) => {
          draft.mail = chainMail;
          draft.delivery = chainDelivery;
          // keep locally known subjects/sent bodies, add newly decrypted bodies
          const payloads: LedgerState["payloads"] = {};
          for (const id of Object.keys(chainMail)) {
            const existing = draft.payloads[id];
            const body = decrypted[id] ?? existing?.body ?? "";
            const subject = decryptedSubjects[id] ?? existing?.subject ?? "Encrypted subject";
            if (existing || decrypted[id] || decryptedSubjects[id]) payloads[id] = { subject, body };
          }
          draft.payloads = payloads;
          const headNumber = Number(header?.number?.toString?.() ?? 0);
          if (headNumber > 0) draft.block = headNumber;
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error("Could not load mailbox from blockchain", { description: message });
        return false;
      }
    },
    [persist],
  );

  const syncAccountFromChain = useCallback(
    async (address: string) => {
      const found = await syncMailboxFromChain(address);
      if (found) await syncMailFromChain(address);
      else {
        persist((draft) => {
          draft.mail = {};
          draft.delivery = [];
          draft.payloads = {};
        });
      }
      return found;
    },
    [persist, syncMailboxFromChain, syncMailFromChain],
  );

  useEffect(() => {
    if (!account || account.source === "demo" || status !== "connected" || !palletAvailable) return;
    void syncAccountFromChain(account.address);
  }, [account, status, palletAvailable, syncAccountFromChain]);

  useEffect(() => {
    if (!account || account.source === "demo" || status !== "connected" || !palletAvailable) return;
    const api = apiRef.current as AnyApi;
    if (!api?.rpc?.chain?.subscribeNewHeads) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void api.rpc.chain
      .subscribeNewHeads(() => {
        if (active) void syncMailFromChain(account.address);
      })
      .then((stop: () => void) => {
        if (active) unsubscribe = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [account, status, palletAvailable, syncMailFromChain]);

  const connectWallet = useCallback(async () => {
    setWalletError(null);
    try {
      const { web3Enable, web3Accounts } = await import("@polkadot/extension-dapp");
      const exts = await web3Enable("NuMail");
      if (exts.length === 0) {
        throw new Error(
          "No Polkadot wallet extension found. Install the Polkadot{.js} extension (or Talisman / SubWallet) and refresh.",
        );
      }
      const injected = await web3Accounts();
      if (injected.length === 0) throw new Error("No accounts were shared with NuMail. Authorise an account in your extension.");
      const list: WalletAccount[] = injected.map((a) => ({
        address: a.address,
        name: a.meta.name ?? "Account",
        source: a.meta.source,
      }));
      setAccounts(list);
      const first = list[0]!;
      setAccount(first);
      toast.success("Wallet connected", { description: first.name });
      const found = await syncAccountFromChain(first.address);
      if (found) toast.info("Existing mailbox found on chain");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWalletError(msg);
      toast.error("Wallet connection failed", { description: msg });
    }
  }, [syncAccountFromChain]);

  const useDevAccount = useCallback(
    async (name: DevAccountName) => {
      setWalletError(null);
      try {
        const acc = await devAccount(name);
        setAccounts((prev) => {
          const rest = prev.filter((a) => a.address !== acc.address);
          return [...rest, acc];
        });
        setAccount(acc);
        toast.success(`Using dev account ${name}`, {
          description: "Signs with the well-known //" + name + " key — real extrinsics on your dev node.",
        });
        const found = await syncAccountFromChain(acc.address);
        if (found) toast.info("Existing mailbox found on chain");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setWalletError(msg);
        toast.error("Could not load dev account", { description: msg });
      }
    },
    [syncAccountFromChain],
  );

  const useDemoAccount = useCallback(() => {
    setAccounts([DEMO_ACCOUNT]);
    setAccount(DEMO_ACCOUNT);
    toast.success("Using demo account", {
      description: "Signing is simulated locally so you can explore the full client.",
    });
  }, []);

  const selectAccount = useCallback(
    (address: string) => {
      const found = accounts.find((a) => a.address === address);
      if (found) {
        setAccount(found);
        if (found.source !== "demo") void syncAccountFromChain(address);
      }
    },
    [accounts, syncAccountFromChain],
  );

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setAccounts([]);
    setBalance(null);
  }, []);


  // balance
  useEffect(() => {
    let cancelled = false;
    const api = apiRef.current as unknown as {
      query?: { system?: { account?: (a: string) => Promise<unknown> } };
      registry?: { chainTokens?: string[] };
    } | null;
    if (!account || status !== "connected" || !api?.query?.system?.account) {
      setBalance(null);
      return;
    }
    void api.query.system
      .account(account.address)
      .then((res) => {
        if (cancelled) return;
        const data = (res as { data?: { free?: { toString: () => string } } }).data;
        const token = api.registry?.chainTokens?.[0] ?? "UNIT";
        const free = data?.free ? Number(BigInt(data.free.toString()) / 1_000_000_00n) / 100 : 0;
        setBalance(`${free.toLocaleString()} ${token}`);
      })
      .catch(() => setBalance(null));
    return () => {
      cancelled = true;
    };
  }, [account, status]);

  // seed demo mail once an account exists and a mailbox is created
  useEffect(() => {
    if (!account) return;
    if (account.source !== "demo") return; // never fabricate mail for a real signer
    if (!ledger.mailboxes[account.address]) return;
    const hasMail = ledger.delivery.some((d) => d.account === account.address);
    if (hasMail) return;
    persist((draft) => seedDemoData(draft, account.address));
  }, [account, ledger.mailboxes, ledger.delivery, persist]);

  // ---- actions -------------------------------------------------------------
  /** true when we can submit real extrinsics: pallet present + real signer */
  const onChain =
    status === "connected" && palletAvailable && Boolean(account) && account?.source !== "demo";

  const run = useCallback(
    async (
      label: string,
      fn: (draft: LedgerState) => void,
      successMsg: string,
      txArgs?: () => unknown[],
    ) => {
      if (!account) throw new Error("Connect a wallet first");
      const api = apiRef.current;
      const blockchainMode = status === "connected" && palletAvailable && account.source !== "demo";
      const live = blockchainMode && Boolean(txArgs) && hasCall(api, label);

      setBusy(label);
      try {
        if (blockchainMode && !live) {
          throw new Error(`Blockchain action nuMail.${label} is unavailable; no local change was made.`);
        }
        if (live && txArgs) {
          // ---- real chain submission ----
          let result;
          try {
            result = await submitExtrinsic(api, account.address, account.source, label, txArgs(), account.devName);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const code = msg.split(".").pop() ?? msg;
            toast.error("Extrinsic failed", { description: humanError(code) || msg });
            throw new Error(msg);
          }
          // mirror into the local read-model so the UI updates immediately
          persist((draft) => {
            try {
              fn(draft);
            } catch {
              /* chain is the source of truth; local mirror is best-effort */
            }
          });
          toast.success(successMsg, {
            description: `In block ${result.blockHash?.slice(0, 10)}… · tx ${result.txHash.slice(0, 10)}…`,
          });
          return result;
        }

        // ---- local simulation ----
        await new Promise((r) => setTimeout(r, 600)); // block inclusion latency
        let failure: string | null = null;
        persist((draft) => {
          try {
            fn(draft);
          } catch (e) {
            failure = e instanceof LedgerError ? humanError(e.code) : String(e);
          }
        });
        await new Promise((r) => setTimeout(r, 30));
        if (failure) {
          toast.error("Extrinsic failed", { description: failure });
          throw new Error(failure);
        }
        toast.success(successMsg, {
          description: palletAvailable
            ? "Simulated locally — connect a real wallet account to submit on chain."
            : "Simulated locally — pallet-numail was not found on this node.",
        });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [account, persist, status, palletAvailable],
  );

  /** Resolve a UI folder label to the exact Bytes value stored in the mailbox. */
  const chainFolderBytes = useCallback(
    async (folder: string) => {
      if (!account) throw new Error("Connect a wallet first");
      const api = apiRef.current as AnyApi;
      const q = api?.query?.nuMail ?? api?.query?.numail;
      if (!q?.mailboxes) throw new Error("NuMail mailbox storage is unavailable");
      const raw = await q.mailboxes(account.address);
      if (typeof raw?.isSome === "boolean" && !raw.isSome) throw new Error("Mailbox not found on blockchain");
      const value = raw?.unwrapOr ? raw.unwrapOr(raw) : raw;
      const json = (value?.toJSON?.() ?? {}) as Record<string, unknown>;
      const stored = Array.isArray(json["folders"]) ? (json["folders"] as unknown[]).map(String) : [];
      const decode = (hex: string) => {
        if (!hex.startsWith("0x")) return hex;
        const bytes = hex.slice(2).match(/.{1,2}/g) ?? [];
        return bytes.map((byte) => String.fromCharCode(Number.parseInt(byte, 16))).join("");
      };
      const exact = stored.find((candidate) => decode(candidate) === folder);
      if (!exact) throw new Error(`Folder "${folder}" is not registered in your blockchain mailbox`);
      return exact;
    },
    [account],
  );

  /** RSA public keys the recipients registered with their on-chain mailboxes. */
  const recipientPublicKeys = useCallback(async (recipients: string[]) => {
    const api = apiRef.current as AnyApi;
    const q = api?.query?.nuMail ?? api?.query?.numail;
    if (!q?.mailboxes) throw new Error("NuMail mailbox storage is unavailable");
    if (!q.publicKeys) throw new Error("NuMail public key storage is unavailable");
    const keys: string[] = [];
    for (const recipient of recipients) {
      const mailbox = await q.mailboxes(recipient);
      if (typeof mailbox?.isSome === "boolean" && !mailbox.isSome) {
        throw new Error(`${recipient} has no NuMail mailbox yet`);
      }
      // the chain stores the key in the `publicKeys` map as hex-encoded
      // PEM text (-----BEGIN RSA PUBLIC KEY----- …) — decode the hex back
      // to text, then normalise to SPKI hex for WebCrypto encryption
      const raw = await q.publicKeys(recipient);
      const value = raw?.unwrapOr ? raw.unwrapOr(raw) : raw;
      const jsonValue = value?.toJSON?.();
      const pub = String(
        typeof jsonValue === "string" ? jsonValue : (value?.toHex?.() ?? value?.toString?.() ?? ""),
      );
      if (!pub || pub === "0x") {
        throw new Error(`${recipient} has no encryption key registered on chain`);
      }
      keys.push(chainPublicKeyToSpkiHex(pub));
    }
    return keys;
  }, []);

  const actions = useMemo<NumailContextValue["actions"]>(
    () => ({
      createMailbox: async (policy, retention, folders) => {
        const address = account?.address;
        
        if (!address) throw new Error("Connect a wallet first");
        // inbox/sent/archive must always be registered on chain, plus any
        // custom folders the user added in the UI.
        const allFolders = Array.from(new Set([...DEFAULT_FOLDERS, ...folders]));
        // RSA-4096 identity key: the private key stays in this browser, the
        // public key is registered on chain as the exact PEM text
        // (-----BEGIN RSA PUBLIC KEY----- … -----END RSA PUBLIC KEY-----).
        const keys = await ensureKeyPair(address);
        const pemBytes = new TextEncoder().encode(publicKeyPem(keys));
        await run(
          "createMailbox",
          (d) => ledgerOps.createMailbox(d, address, policy, retention, folders),
          "Mailbox created",
          () => [encodePolicy(policy), retention ?? null, allFolders, `0x${bytesToHex(pemBytes)}`],
        );
        if (account.source !== "demo") await syncAccountFromChain(address);
      },
      importKey: async (pair) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");

        // Verify against the public key registered on chain for THIS account,
        // so a wrong key can never replace a working one.
        if (account.source !== "demo") {
          const api = apiRef.current as AnyApi;
          const q = api?.query?.nuMail ?? api?.query?.numail;
          if (status !== "connected" || !palletAvailable || !q?.publicKeys) {
            throw new Error("Connect to the network first so the key can be checked against your on-chain public key.");
          }
          const raw = await q.publicKeys(address);
          const value = raw?.unwrapOr ? raw.unwrapOr(raw) : raw;
          const jsonValue = value?.toJSON?.();
          const onChain = String(
            typeof jsonValue === "string" ? jsonValue : (value?.toHex?.() ?? value?.toString?.() ?? ""),
          );
          // no key registered yet (mailbox not created) → nothing to compare against
          if (onChain && onChain !== "0x" && !samePublicKey(pair.publicKeyHex, chainPublicKeyToSpkiHex(onChain))) {
            throw new Error(
              "This key does not match the public key registered on chain for this account, so it can't decrypt this mailbox.",
            );
          }
        }

        saveKeyPair(address, pair);
        toast.success("Key imported", {
          description: "This device can now read and send encrypted mail for this account.",
        });
        if (account.source !== "demo") await syncAccountFromChain(address);
      },
      setPolicy: async (policy, retention) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        await run(
          "setMailboxPolicy",
          (d) => ledgerOps.setPolicy(d, address, policy, retention),
          "Policy updated",
          () => [encodePolicy(policy), retention ?? null],
        );
      },
      // The pallet has no add_folder call — folders are fixed at mailbox
      // creation — so this stays a local-only convenience (no txArgs → simulate).
      addFolder: async (name) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        await run(
          "createFolder",
          (d) => ledgerOps.addFolder(d, address, name),
          `Folder "${name}" added`,
          () => [folderToBytes(name)],
        );
        // chain is the source of truth for real signers: re-read the folder list
        if (account.source !== "demo") await syncAccountFromChain(address);
      },
      deleteFolder: async (name) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        await run(
          "deleteFolder",
          (d) => ledgerOps.removeFolder(d, address, name),
          `Folder "${name}" deleted`,
          () => [folderToBytes(name)],
        );
        if (account.source !== "demo") await syncAccountFromChain(address);
      },
      sendMail: async (input) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        let id: string | null = null;
        // Hybrid encryption: one random AES-256 key encrypts the body, and that
        // key is wrapped with each recipient's on-chain RSA public key.
        // The outputs are text (base64 body, hex keys) — they go on chain
        // byte-for-byte as UTF-8, with no reformatting.
        const textToChainBytes = (text: string) => `0x${bytesToHex(new TextEncoder().encode(text))}`;
        let encryptedSubjectHex = "0x";
        let encryptedBodyHex = "0x";
        let encryptedKeys: [string, string][] = [];
        // The on-chain `recipients` list is what actually gets sent in the
        // extrinsic. The pallet rejects the call unless
        // encryptedKeys.len() === recipients.len() (EncryptedKeyCountMismatch),
        // so to give the sender their own wrapped key, the sender's address
        // must itself be included here as a recipient — there's no way to
        // smuggle in an extra key/recipient pair otherwise.
        let chainRecipients = input.recipients;
        if (onChain) {
          const myKeys = loadKeyPair(address);
          const wrapForSelf = !!myKeys && !input.recipients.includes(address);
          if (wrapForSelf) chainRecipients = [...input.recipients, address];
          const pubKeys = await recipientPublicKeys(input.recipients);
          const allPubKeys = wrapForSelf ? [...pubKeys, myKeys!.publicKeyHex] : pubKeys;
          // Subject and body are encrypted together under the same AES key,
          // which is then wrapped once per recipient (see keys.ts).
          const cipher = await encryptMailForRecipients(input.subject, input.body, allPubKeys);
          encryptedSubjectHex = textToChainBytes(cipher.encryptedSubjectB64);
          encryptedBodyHex = textToChainBytes(cipher.encryptedBodyB64);
          encryptedKeys = chainRecipients.map((r, i) => [r, textToChainBytes(cipher.encryptedKeysHex[i] ?? "")]);
        }
        const result = await run(
          "sendMail",
          (d) => {
            id = ledgerOps.sendMail(d, address, input).mailId;
          },
          "Mail sent",
          () => [
            chainRecipients,
            encryptedSubjectHex,
            encryptedBodyHex,
            encryptedKeys,
            encodeAttachments(input.attachments),
            input.threadParent && /^\d+$/.test(input.threadParent) ? Number(input.threadParent) : null,
          ],
        );
        if (result) {
          const chainId = mailIdFromEvents(result);
          // re-key the local mirror to the id the chain actually assigned
          if (chainId && id && chainId !== id) {
            persist((d) => ledgerOps.renameMailId(d, id!, chainId));
          }
          if (account.source !== "demo") await syncMailFromChain(address);
          return chainId ?? id;
        }
        return id;
      },
            systemNotice: async (input) => {
        if (status !== "connected" || !palletAvailable) {
          throw new Error("Connect to a node that has pallet-numail first");
        }
        const api = apiRef.current as AnyApi;
        if (!hasCall(api, "systemNotice")) throw new Error("This node does not expose nuMail.systemNotice");

        setBusy("system_notice");
        try {
          const textToChainBytes = (text: string) => `0x${bytesToHex(new TextEncoder().encode(text))}`;
          // Same hybrid encryption as sendMail: one AES key for subject+body,
          // wrapped once per recipient. The chain needs exactly one key per
          // recipient, so the sender is NOT added.
          const pubKeys = await recipientPublicKeys(input.recipients);
          const cipher = await encryptMailForRecipients(input.subject, input.body, pubKeys);
          const encryptedKeys: [string, string][] = input.recipients.map((r, i) => [
            r,
            textToChainBytes(cipher.encryptedKeysHex[i] ?? ""),
          ]);

          let result;
          try {
            result = await submitSystemNotice(
              api,
              [
                input.sender,
                input.recipients,
                textToChainBytes(cipher.encryptedSubjectB64),
                textToChainBytes(cipher.encryptedBodyB64),
                encryptedKeys,
                input.threadParent && /^\d+$/.test(input.threadParent) ? Number(input.threadParent) : null,
              ],
              account && account.source !== "demo" ? account : undefined,
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const code = msg.split(".").pop() ?? msg;
            toast.error("System notice failed", { description: humanError(code) || msg });
            throw new Error(msg);
          }
          toast.success("System notice sent", {
            description: `In block ${result.blockHash?.slice(0, 10)}… · tx ${result.txHash.slice(0, 10)}…`,
          });
          if (account && account.source !== "demo") await syncMailFromChain(account.address);
          return mailIdFromEvents(result);
        } finally {
          setBusy(null);
        }
      },
      markRead: async (mailId) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        await run(
          "markRead",
          (d) => ledgerOps.markRead(d, address, mailId),
          "Marked as read",
          () => [Number(mailId)],
        );
        if (account.source !== "demo") await syncMailFromChain(address);
      },
      watchDeliveryStatuses: async (mailId, recipients, onUpdate) => {
        const toStatus = (opt: AnyApi): DeliveryStatus | null => {
          if (!opt || opt.isSome === false) return null; // Option::None
          const inner = opt.isSome ? opt.unwrap() : opt;
          const name = String(inner?.type ?? inner?.toString?.() ?? "");
          return name === "Delivered" || name === "Read" || name === "Archived" || name === "Tombstoned" ? name : null;
        };

        // demo / local mode: the simulated ledger already holds every recipient's state
        if (!onChain) {
          const led = ledgerRef.current;
          onUpdate(
            Object.fromEntries(
              recipients.map((r) => [r, led.delivery.find((d) => d.mailId === mailId && d.account === r)?.status ?? null]),
            ),
          );
          return () => undefined;
        }

        const api = apiRef.current as AnyApi;
        const q = api?.query?.nuMail ?? api?.query?.numail;
        if (!q?.deliveryState?.multi) throw new Error("This node does not expose nuMail.deliveryState");

        // deliveryState(mailId, recipient) -> Option<DeliveryStatus>, subscribed so the
        // sender sees "Read" the moment the recipient's mark_read is included in a block
        const keys = recipients.map((r) => [Number(mailId), r]);
        const unsub = await q.deliveryState.multi(keys, (results: AnyApi[]) => {
          const out: Record<string, DeliveryStatus | null> = {};
          results.forEach((opt, i) => {
            const addr = recipients[i];
            if (addr) out[addr] = toStatus(opt);
          });
          onUpdate(out);
        });
        return unsub as () => void;
      },
      moveToFolder: async (mailId, folder) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        const folderBytes = onChain ? await chainFolderBytes(folder) : folder;
        await run(
          "moveToFolder",
          (d) => ledgerOps.moveToFolder(d, address, mailId, folder),
          `Moved to ${folder}`,
          () => [Number(mailId), folderBytes],
        );
        if (account.source !== "demo") await syncMailFromChain(address);
      },
      archiveMail: async (mailId, target) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");

        // ---- validate synchronously: the file picker below needs the click's user gesture ----
        const led = ledgerRef.current;
        const envelope = led.mail[mailId];
        const delivery = led.delivery.find((d) => d.mailId === mailId && d.account === address && d.status !== "Tombstoned");
        const payload = led.payloads[mailId];
        if (!envelope || !delivery) throw new Error("Mail not found");
        if (!payload || (payload.subject === "Encrypted subject" && !payload.body)) {
          throw new Error("This mail can't be decrypted on this device, so a .pst copy can't be made.");
        }
        const keyPair = loadKeyPair(address);
        if (!keyPair) throw new Error("No encryption key on this device — create or import your key first.");

        const existing = "archiveId" in target ? archivesRef.current.find((a) => a.id === target.archiveId) : undefined;
        if ("archiveId" in target && !existing) throw new Error("Archive folder not found");
        const name = existing?.name ?? ("newName" in target ? target.newName.trim() : "");
        if (!name || name.length > MAX_ARCHIVE_NAME) {
          throw new Error(`Folder name must be 1–${MAX_ARCHIVE_NAME} characters.`);
        }
        if (!existing && archivesRef.current.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
          throw new Error(`An archive folder named “${name}” already exists.`);
        }
        const id = existing?.id ?? newArchiveId();

        // 1) choose the .pst location FIRST (before any chain change; cancelling aborts cleanly)
        const sink = await acquirePstSink(id, name);
        if (!sink) throw new Error("Archive cancelled — no .pst location was chosen.");

        // 2) on-chain: existing move_to_folder → default "archive" folder
        if (delivery.folder !== "archive") {
          const folderBytes = onChain ? await chainFolderBytes("archive") : "archive";
          await run(
            "moveToFolder",
            (d) => ledgerOps.moveToFolder(d, address, mailId, "archive"),
            "Moved to archive",
            () => [Number(mailId), folderBytes],
          );
        }

        // 3) snapshot into the named archive folder
        const head = await headBlockNow();
        const retention = ledgerRef.current.mailboxes[address]?.retention;
        const item: ArchivedItem = {
          mailId,
          envelope,
          subject: payload.subject,
          body: payload.body,
          originFolder: delivery.folder,
          archivedAtBlock: head,
          archivedAt: Date.now(),
          retentionBlocks: retention,
        };
        const now = Date.now();
        const next: ArchiveFolder[] = existing
          ? archivesRef.current.map((a) =>
              a.id === id ? { ...a, updatedAt: now, items: [item, ...a.items.filter((i) => i.mailId !== mailId)] } : a,
            )
          : [...archivesRef.current, { id, name, owner: address, createdAt: now, updatedAt: now, items: [item] }];
        commitArchives(address, next);
        if (account.source !== "demo") await syncMailFromChain(address);

        // 4) write the .pst
        try {
          const folderNow = next.find((a) => a.id === id)!;
          await sink.write(await buildPst(folderNow, keyPair.publicKeyHex));
          toast.success(`Archived to “${name}”`, { description: `Saved to ${sink.fileName}` });
        } catch (e) {
          toast.warning(`Archived to “${name}”, but the .pst file was not written`, {
            description: `${e instanceof Error ? e.message : String(e)} — use “Save .pst” on the folder to retry.`,
          });
        }
      },

      setDisplayName: async (name) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        const clean = name.trim();
        const invalid = validateDisplayName(clean);
        if (invalid) throw new Error(invalid);

        if (!onChain) {
          // demo / offline: keep it locally only
          setDirectory((d) => ({ ...d, [address]: clean }));
          toast.success("Display name saved", { description: clean });
          return;
        }
        const api = apiRef.current as AnyApi;
        if (!hasCall(api, "setDisplayName")) {
          throw new Error("This node doesn't support display names yet — the runtime needs the upgrade.");
        }
        setBusy("setDisplayName");
        try {
          try {
            await submitExtrinsic(api, address, account.source, "setDisplayName", [folderToBytes(clean)], account.devName);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error("Could not save display name", { description: humanError(msg.split(".").pop() ?? msg) || msg });
            throw new Error(msg);
          }
          toast.success("Display name saved", { description: clean });
          await syncDirectory();
        } finally {
          setBusy(null);
        }
      },

      clearDisplayName: async () => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        if (!onChain) {
          setDirectory((d) => {
            const { [address]: _removed, ...rest } = d;
            return rest;
          });
          return;
        }
        const api = apiRef.current as AnyApi;
        if (!hasCall(api, "clearDisplayName")) throw new Error("This node doesn't support display names yet.");
        setBusy("clearDisplayName");
        try {
          try {
            await submitExtrinsic(api, address, account.source, "clearDisplayName", [], account.devName);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error("Could not clear display name", { description: humanError(msg.split(".").pop() ?? msg) || msg });
            throw new Error(msg);
          }
          toast.success("Display name removed");
          await syncDirectory();
        } finally {
          setBusy(null);
        }
      },

      setContact: (address, nickname) => {
        const owner = account?.address;
        if (!owner) return;
        const next = { ...contactsRef.current };
        const clean = nickname.trim().slice(0, 40);
        if (clean) next[address] = clean;
        else delete next[address];
        contactsRef.current = next;
        setContacts(next);
        window.localStorage.setItem(CONTACTS_KEY + owner, JSON.stringify(next));
      },

      restoreArchived: async (archiveId, mailId, folder) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        const af = archivesRef.current.find((a) => a.id === archiveId);
        const item = af?.items.find((i) => i.mailId === mailId);
        if (!af || !item) throw new Error("Archived mail not found");
        if (folder === "archive") throw new Error("Choose a folder other than archive.");

        const head = await headBlockNow();
        if (!canRestore(item, head)) {
          toast.error("Retention period ended", {
            description: "This archived mail can no longer be moved out of the archive.",
          });
          throw new Error("Retention period ended");
        }
        const live = ledgerRef.current.delivery.find(
          (d) => d.mailId === mailId && d.account === address && d.status !== "Tombstoned",
        );
        if (!live) {
          toast.error("Not available on chain", {
            description: "This mail only exists in the .pst file now, so it can't be restored.",
          });
          throw new Error("Mail is no longer on chain");
        }

        const folderBytes = onChain ? await chainFolderBytes(folder) : folder;
        await run(
          "moveToFolder",
          (d) => ledgerOps.moveToFolder(d, address, mailId, folder),
          `Restored to ${folder}`,
          () => [Number(mailId), folderBytes],
        );

        const next = archivesRef.current.map((a) =>
          a.id === archiveId ? { ...a, updatedAt: Date.now(), items: a.items.filter((i) => i.mailId !== mailId) } : a,
        );
        commitArchives(address, next);
        if (account.source !== "demo") await syncMailFromChain(address);

        // keep the .pst in step (silently, only if it is already open in this session)
        const pair = loadKeyPair(address);
        const remaining = next.find((a) => a.id === archiveId);
        if (remaining && pair && hasPstSink(archiveId)) {
          try {
            const sink = await acquirePstSink(archiveId, remaining.name);
            await sink?.write(await buildPst(remaining, pair.publicKeyHex));
          } catch {
            toast.warning("The .pst file could not be updated", { description: "Use “Save .pst” on the folder." });
          }
        } else {
          toast.info("The .pst file still lists this mail until you save it again.");
        }
      },

      openPst: async (file) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        const keyPair = loadKeyPair(address);
        if (!keyPair) throw new Error("No encryption key on this device — import your key first.");

        let parsed;
        try {
          parsed = await readPst(await file.text(), address, keyPair.privateKeyBase64);
        } catch (e) {
          throw e instanceof PstError ? e : new Error("Could not read this .pst file.");
        }
        const { folder, skipped } = parsed;

        // mail that was restored out of the archive since this .pst was last saved stays out
        const led = ledgerRef.current;
        const wasRestored = (i: ArchivedItem) => {
          const live = led.delivery.find((d) => d.mailId === i.mailId && d.account === address && d.status !== "Tombstoned");
          return !!live && live.folder !== "archive";
        };
        const incoming = folder.items.filter((i) => !wasRestored(i));
        const restored = folder.items.length - incoming.length;

        const existing = archivesRef.current.find((a) => a.id === folder.id);
        const merged: ArchiveFolder = existing
          ? {
              ...existing,
              updatedAt: Date.now(),
              items: [...existing.items, ...incoming.filter((i) => !existing.items.some((e) => e.mailId === i.mailId))],
            }
          : { ...folder, items: incoming };
        commitArchives(
          address,
          existing ? archivesRef.current.map((a) => (a.id === folder.id ? merged : a)) : [...archivesRef.current, merged],
        );

        const notes = [
          skipped ? `${skipped} item(s) could not be decrypted` : "",
          restored ? `${restored} already restored item(s) skipped` : "",
        ].filter(Boolean);
        toast.success(`Opened “${folder.name}”`, {
          description: [`${incoming.length} item(s)`, ...notes].join(" · "),
        });
        return folder.id;
      },

      savePst: async (archiveId) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        const af = archivesRef.current.find((a) => a.id === archiveId);
        const keyPair = loadKeyPair(address);
        if (!af) throw new Error("Archive folder not found");
        if (!keyPair) throw new Error("No encryption key on this device.");
        const sink = await acquirePstSink(af.id, af.name); // first await: keeps the user gesture
        if (!sink) return;
        await sink.write(await buildPst(af, keyPair.publicKeyHex));
        toast.success(`Saved ${sink.fileName}`);
      },

      closeArchive: (archiveId) => {
        const address = account?.address;
        if (!address) return;
        const af = archivesRef.current.find((a) => a.id === archiveId);
        dropPstSink(archiveId);
        commitArchives(address, archivesRef.current.filter((a) => a.id !== archiveId));
        toast.success(`Closed “${af?.name ?? "archive"}”`, {
          description: "Your .pst file is untouched — open it again any time.",
        });
      },
      tombstone: async (mailId) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        await run(
          "tombstone",
          (d) => ledgerOps.tombstone(d, address, mailId),
          "Mail tombstoned",
          () => [Number(mailId)],
        );
        if (account.source !== "demo") await syncMailFromChain(address);
      },
      blockSender: async (blocked) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        await run("blockSender", (d) => ledgerOps.blockSender(d, address, blocked), "Sender blocked", () => [blocked]);
      },
      unblockSender: async (unblocked) => {
        const address = account?.address;
        if (!address) throw new Error("Connect a wallet first");
        await run("unblockSender", (d) => ledgerOps.unblockSender(d, address, unblocked), "Sender unblocked", () => [unblocked]);
      },
      resetChainData: () => {
        window.localStorage.removeItem("numail_local_ledger_v1");
        setLedger(loadLedger());
        toast.success("Local NuMail state cleared");
      },
    }),
    [run, account, onChain, chainFolderBytes, recipientPublicKeys, persist, syncAccountFromChain, syncMailFromChain, status, palletAvailable, commitArchives, headBlockNow],
  );

  const value: NumailContextValue = {
    endpoint,
    status,
    connError,
    chainName,
    lastConnectedAt,
    palletAvailable,
    onChain,
    setEndpoint,
    reconnect,
    testEndpoint,
    accounts,
    account,
    walletError,
    connectWallet,
    useDemoAccount,
    useDevAccount,
    selectAccount,
    disconnectWallet,
    balance,
    ledger,
    archives,
    busy,
    actions,
    directory,
    contacts,
  };

  return <NumailContext.Provider value={value}>{children}</NumailContext.Provider>;
}

export function useNumail() {
  const ctx = useContext(NumailContext);
  if (!ctx) throw new Error("useNumail must be used inside <NumailProvider>");
  return ctx;
}
