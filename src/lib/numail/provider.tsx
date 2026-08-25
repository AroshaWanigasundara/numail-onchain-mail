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
  ENDPOINT_STORAGE_KEY,
  PALLET_ERRORS,
  type Attachment,
  type MailboxPolicy,
} from "./types";
import {
  LedgerError,
  ledgerOps,
  loadLedger,
  saveLedger,
  seedDemoData,
  type LedgerState,
} from "./ledger";

export type ConnStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface WalletAccount {
  address: string;
  name: string;
  source: string;
}

interface NumailContextValue {
  // connection
  endpoint: string | null;
  status: ConnStatus;
  connError: string | null;
  chainName: string | null;
  lastConnectedAt: number | null;
  palletAvailable: boolean;
  setEndpoint: (url: string) => void;
  reconnect: () => void;
  testEndpoint: (url: string) => Promise<{ ok: boolean; message: string }>;

  // wallet
  accounts: WalletAccount[];
  account: WalletAccount | null;
  walletError: string | null;
  connectWallet: () => Promise<void>;
  useDemoAccount: () => void;
  selectAccount: (address: string) => void;
  disconnectWallet: () => void;
  balance: string | null;

  // ledger
  ledger: LedgerState;
  busy: string | null;
  actions: {
    createMailbox: (p: MailboxPolicy, retention: number | undefined, folders: string[]) => Promise<void>;
    setPolicy: (p: MailboxPolicy, retention: number | undefined) => Promise<void>;
    addFolder: (name: string) => Promise<void>;
    sendMail: (input: {
      recipients: string[];
      subject: string;
      body: string;
      attachments: Attachment[];
      threadParent?: string | undefined;
      postage?: number | undefined;
    }) => Promise<string | null>;
    markRead: (mailId: string) => Promise<void>;
    moveToFolder: (mailId: string, folder: string) => Promise<void>;
    tombstone: (mailId: string) => Promise<void>;
    blockSender: (address: string) => Promise<void>;
    unblockSender: (address: string) => Promise<void>;
    resetChainData: () => void;
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

  const apiRef = useRef<{ disconnect: () => Promise<void> } | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hydrate saved endpoint / account
  useEffect(() => {
    const saved = window.localStorage.getItem(ENDPOINT_STORAGE_KEY);
    if (saved) setEndpointState(saved);
    const savedAcc = window.localStorage.getItem("numail_account");
    if (savedAcc) {
      try {
        setAccount(JSON.parse(savedAcc) as WalletAccount);
      } catch {
        /* ignore */
      }
    }
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
        setPalletAvailable(Boolean((api.tx as Record<string, unknown>)["numail"]));
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
      const hasPallet = Boolean((api.tx as Record<string, unknown>)["numail"]);
      await api.disconnect();
      return {
        ok: true,
        message: `Connected to ${chain.toString()}${hasPallet ? " — pallet-numail detected" : " — pallet-numail not found on this node"}`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  // ---- wallet --------------------------------------------------------------
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
      window.localStorage.setItem("numail_account", JSON.stringify(first));
      toast.success("Wallet connected", { description: first.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWalletError(msg);
      toast.error("Wallet connection failed", { description: msg });
    }
  }, []);

  const useDemoAccount = useCallback(() => {
    setAccounts([DEMO_ACCOUNT]);
    setAccount(DEMO_ACCOUNT);
    window.localStorage.setItem("numail_account", JSON.stringify(DEMO_ACCOUNT));
    toast.success("Using demo account", {
      description: "Signing is simulated locally so you can explore the full client.",
    });
  }, []);

  const selectAccount = useCallback(
    (address: string) => {
      const found = accounts.find((a) => a.address === address);
      if (found) {
        setAccount(found);
        window.localStorage.setItem("numail_account", JSON.stringify(found));
      }
    },
    [accounts],
  );

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setAccounts([]);
    setBalance(null);
    window.localStorage.removeItem("numail_account");
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
    if (!ledger.mailboxes[account.address]) return;
    const hasMail = ledger.delivery.some((d) => d.account === account.address);
    if (hasMail) return;
    persist((draft) => seedDemoData(draft, account.address));
  }, [account, ledger.mailboxes, ledger.delivery, persist]);

  // ---- actions -------------------------------------------------------------
  const run = useCallback(
    async (label: string, fn: (draft: LedgerState) => void, successMsg: string) => {
      if (!account) throw new Error("Connect a wallet first");
      setBusy(label);
      try {
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
        toast.success(successMsg);
      } finally {
        setBusy(null);
      }
    },
    [account, persist],
  );

  const actions = useMemo<NumailContextValue["actions"]>(
    () => ({
      createMailbox: (policy, retention, folders) =>
        run(
          "create_mailbox",
          (d) => ledgerOps.createMailbox(d, account!.address, policy, retention, folders),
          "Mailbox created",
        ),
      setPolicy: (policy, retention) =>
        run("set_mailbox_policy", (d) => ledgerOps.setPolicy(d, account!.address, policy, retention), "Policy updated"),
      addFolder: (name) => run("add_folder", (d) => ledgerOps.addFolder(d, account!.address, name), `Folder "${name}" added`),
      sendMail: async (input) => {
        let id: string | null = null;
        await run(
          "send_mail",
          (d) => {
            id = ledgerOps.sendMail(d, account!.address, input).mailId;
          },
          "Mail sent",
        );
        return id;
      },
      markRead: (mailId) => run("mark_read", (d) => ledgerOps.markRead(d, account!.address, mailId), "Marked as read"),
      moveToFolder: (mailId, folder) =>
        run("move_to_folder", (d) => ledgerOps.moveToFolder(d, account!.address, mailId, folder), `Moved to ${folder}`),
      tombstone: (mailId) => run("tombstone", (d) => ledgerOps.tombstone(d, account!.address, mailId), "Mail tombstoned"),
      blockSender: (address) =>
        run("block_sender", (d) => ledgerOps.blockSender(d, account!.address, address), "Sender blocked"),
      unblockSender: (address) =>
        run("unblock_sender", (d) => ledgerOps.unblockSender(d, account!.address, address), "Sender unblocked"),
      resetChainData: () => {
        window.localStorage.removeItem("numail_local_ledger_v1");
        setLedger(loadLedger());
        toast.success("Local NuMail state cleared");
      },
    }),
    [run, account],
  );

  const value: NumailContextValue = {
    endpoint,
    status,
    connError,
    chainName,
    lastConnectedAt,
    palletAvailable,
    setEndpoint,
    reconnect,
    testEndpoint,
    accounts,
    account,
    walletError,
    connectWallet,
    useDemoAccount,
    selectAccount,
    disconnectWallet,
    balance,
    ledger,
    busy,
    actions,
  };

  return <NumailContext.Provider value={value}>{children}</NumailContext.Provider>;
}

export function useNumail() {
  const ctx = useContext(NumailContext);
  if (!ctx) throw new Error("useNumail must be used inside <NumailProvider>");
  return ctx;
}
