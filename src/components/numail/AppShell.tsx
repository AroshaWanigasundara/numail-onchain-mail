import { useMemo, useRef, useState, type ReactNode, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Archive,
  BellRing,
  Copy,
  Folder,
  Inbox,
  LogOut,
  Mail,
  Menu,
  PenSquare,
  Send,
  Settings as SettingsIcon,
  Wallet,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useNumail } from "@/lib/numail/provider";
import { DEV_ACCOUNT_NAMES } from "@/lib/numail/devAccounts";
import { ComposeDialog } from "./ComposeDialog";
import { CreateMailboxCard } from "./CreateMailboxCard";
import { NetworkSettings } from "./NetworkSettings";
import { ConnectionBadge } from "./ConnectionBadge";
import { shortAddr } from "./shared";
import { SystemNoticeDialog } from "./SystemNoticeDialog";
import { ARCHIVE_PREFIX } from "@/lib/numail/archive";

const folderIcon = (name: string) => {
  if (name === "inbox") return Inbox;
  if (name === "sent") return Send;
  if (name === "archive") return Archive;
  return Folder;
};

export function useFolderCounts() {
  const { ledger, account, archives, } = useNumail();
  return useMemo(() => {
    const counts: Record<string, { total: number; unread: number }> = {};
    if (!account) return counts;
    const archivedIds = new Set(archives.flatMap((a) => a.items.map((i) => i.mailId)));
    for (const d of ledger.delivery) {
      if (d.account !== account.address || d.status === "Tombstoned") continue;
      if (d.folder === "archive" && archivedIds.has(d.mailId)) continue;
      counts[d.folder] ??= { total: 0, unread: 0 };
      counts[d.folder]!.total += 1;
      if (d.status === "Delivered") counts[d.folder]!.unread += 1;
    }
    return counts;
  }, [ledger.delivery, account, archives]);
}

function SidebarBody({
  activeFolder,
  onSelectFolder,
  onNavigate,
}: {
  activeFolder?: string;
  onSelectFolder?: (f: string) => void;
  onNavigate?: () => void;
}) {
  const { account, ledger, disconnectWallet, balance, archives, actions, directory } = useNumail();
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = useFolderCounts();
  const mailbox = account ? ledger.mailboxes[account.address] : undefined;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-3">
      {account && (
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
          <p className="text-xs font-medium text-sidebar-foreground">{directory[account.address] ?? account.name}</p>
          <button
            type="button"
            className="text-mono mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(account.address);
              toast.success("Address copied");
            }}
          >
            {shortAddr(account.address, 8)} <Copy className="h-3 w-3" />
          </button>
          {balance && <p className="mt-1 text-[11px] text-muted-foreground">Balance: {balance}</p>}
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Folders">
        {(mailbox?.folders ?? []).map((f) => {
          const Icon = folderIcon(f);
          const c = counts[f];
          const active = pathname === "/" && activeFolder === f;
          return (
            <Link
              key={f}
              to="/"
              onClick={() => {
                onSelectFolder?.(f);
                onNavigate?.();
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm capitalize transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{f}</span>
              {c?.unread ? (
                <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">{c.unread}</Badge>
              ) : c?.total ? (
                <span className="text-[11px] text-muted-foreground">{c.total}</span>
              ) : null}
            </Link>
          );
        })}
        {account && (
          <>
            <div className="px-3 pt-4 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Archive folders
            </div>
            {archives.map((a) => {
              const key = `${ARCHIVE_PREFIX}${a.id}`;
              const active = pathname === "/" && activeFolder === key;
              return (
                <Link
                  key={a.id}
                  to="/"
                  onClick={() => {
                    onSelectFolder?.(key);
                    onNavigate?.();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <Archive className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-left">{a.name}</span>
                  <span className="text-[11px] text-muted-foreground">{a.items.length}</span>
                </Link>
              );
            })}
            <input
              ref={fileRef}
              type="file"
              accept=".pst"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                actions
                  .openPst(file)
                  .then((id) => onSelectFolder?.(`${ARCHIVE_PREFIX}${id}`))
                  .catch((err: unknown) =>
                    toast.error("Could not open .pst file", {
                      description: err instanceof Error ? err.message : String(err),
                    }),
                  );
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              Open .pst file…
            </button>
          </>
        )}
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border pt-2">
        <Link
          to="/settings"
          onClick={onNavigate}
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
            pathname === "/settings"
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          Settings
        </Link>
        {account && (
          <button
            type="button"
            onClick={disconnectWallet}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
            Disconnect wallet
          </button>
        )}
      </div>
    </div>
  );
}

function ConnectWalletScreen() {
  const { connectWallet, useDemoAccount, useDevAccount, walletError, status, palletAvailable, } = useNumail();
  const [noticeOpen, setNoticeOpen] = useState(false);  
  return (
    <div className="mx-auto w-full max-w-md surface-panel p-5 text-center sm:p-8">
      <div className="brand-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-xl">
        <Mail className="h-6 w-6 text-primary-foreground" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Welcome to NuMail</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        On-chain correspondence on Polkadot. Connect a wallet to open your mailbox.
      </p>
      {walletError && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-xs text-destructive">{walletError}</p>}
      <Button className="mt-6 w-full" onClick={() => void connectWallet()}>
        <Wallet className="h-4 w-4" />
        Connect Polkadot wallet
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={useDemoAccount}>
        Continue with a demo account
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        The demo account signs locally so you can explore every screen without an extension.
      </p>

      <div className="mt-6 border-t border-border pt-4 text-left">
        <p className="text-xs font-medium">Development accounts</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Well-known Substrate dev keys (//Alice, //Bob, …). They sign real extrinsics on your dev node — never use
          on a live network.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {DEV_ACCOUNT_NAMES.map((name) => (
            <Button
              key={name}
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void useDevAccount(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4 text-left">
        <p className="text-xs font-medium">Developer tools</p>
        <p className="mt-0.5 mb-2 text-[11px] text-muted-foreground">
          Send a privileged system notice (signed with the sudo key). No wallet needed.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={status !== "connected" || !palletAvailable}
          onClick={() => setNoticeOpen(true)}
        >
          <BellRing className="h-4 w-4" />
          Test system notice
        </Button>
      </div>

      <SystemNoticeDialog open={noticeOpen} onOpenChange={setNoticeOpen} />
      
    </div>
  );
}

export function AppShell({
  children,
  activeFolder,
  onSelectFolder,
  rightSlot,
}: {
  children: ReactNode;
  activeFolder?: string;
  onSelectFolder?: (f: string) => void;
  rightSlot?: ReactNode;
}) {
  const { endpoint, account, ledger } = useNumail();
  const [composeTo, setComposeTo] = useState<string[]>([]);
  useEffect(() => {
    const onCompose = (e: Event) => {
      setComposeTo((e as CustomEvent<{ to?: string[] }>).detail?.to ?? []);
      setComposeOpen(true);
    };
    window.addEventListener("numail:compose", onCompose);
    return () => window.removeEventListener("numail:compose", onCompose);
  }, []);
  const [composeOpen, setComposeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const mailbox = account ? ledger.mailboxes[account.address] : undefined;
  const ready = Boolean(endpoint) && Boolean(account) && Boolean(mailbox);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:flex sm:gap-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
          {ready && (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-72 max-w-[calc(100vw-2rem)] flex-col bg-sidebar p-0">
                <SheetTitle className="shrink-0 px-4 pt-4 text-sm">NuMail</SheetTitle>
                <SidebarBody
                  {...(activeFolder ? { activeFolder } : {})}
                  {...(onSelectFolder ? { onSelectFolder } : {})}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
          )}

          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <Mail className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="truncate text-base font-semibold tracking-tight">NuMail</span>
          </Link>

          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:ml-auto sm:gap-2">
            {rightSlot}
            {!endpoint ? (
              <Button size="sm" variant="outline" aria-label="Configure endpoint" onClick={() => setSetupOpen(true)}>
                <SettingsIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Configure endpoint</span>
              </Button>
            ) : (
              <ConnectionBadge />
            )}
            {ready && (
              <Button size="sm" aria-label="Compose mail" onClick={() => setComposeOpen(true)}>
                <PenSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Compose</span>
              </Button>
            )}
            {account && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account menu">
                    <Wallet className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-mono text-xs break-all">{account.address}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Settings</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {ready && (
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
            <SidebarBody
              {...(activeFolder ? { activeFolder } : {})}
              {...(onSelectFolder ? { onSelectFolder } : {})}
            />
          </aside>
        )}

        <main className="min-w-0 flex-1">
          {!endpoint ? (
            <div className="mx-auto w-full max-w-2xl p-4 sm:p-8">
              <div className="surface-panel p-4 sm:p-6">
                <h1 className="text-xl font-semibold tracking-tight">Configure your blockchain connection</h1>
                <p className="mt-1 mb-5 text-sm text-muted-foreground">
                  NuMail talks to a Substrate node over WebSocket. Choose a preset or enter your own endpoint, test it,
                  then continue.
                </p>
                <NetworkSettings />
              </div>
            </div>
          ) : !account ? (
            <div className="p-4 py-6 sm:p-8">
              <ConnectWalletScreen />
            </div>
          ) : !mailbox ? (
            <div className="p-4 py-6 sm:p-8">
              <CreateMailboxCard />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={(v) => {
          setComposeOpen(v);
          if (!v) setComposeTo([]);
        }}
        initialRecipients={composeTo}
      />

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Configure blockchain connection</DialogTitle>
            <DialogDescription>Pick a preset or enter a custom Substrate WebSocket endpoint.</DialogDescription>
          </DialogHeader>
          <NetworkSettings onSaved={() => setSetupOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
