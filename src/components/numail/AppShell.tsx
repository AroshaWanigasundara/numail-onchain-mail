import { useMemo, useState, type ReactNode } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { useNumail } from "@/lib/numail/provider";
import { DEV_ACCOUNT_NAMES } from "@/lib/numail/devAccounts";
import { ComposeDialog } from "./ComposeDialog";
import { CreateMailboxCard } from "./CreateMailboxCard";
import { NetworkSettings } from "./NetworkSettings";
import { ConnectionBadge } from "./ConnectionBadge";
import { shortAddr } from "./shared";

const folderIcon = (name: string) => {
  if (name === "inbox") return Inbox;
  if (name === "sent") return Send;
  if (name === "archive") return Archive;
  return Folder;
};

export function useFolderCounts() {
  const { ledger, account } = useNumail();
  return useMemo(() => {
    const counts: Record<string, { total: number; unread: number }> = {};
    if (!account) return counts;
    for (const d of ledger.delivery) {
      if (d.account !== account.address || d.status === "Tombstoned") continue;
      counts[d.folder] ??= { total: 0, unread: 0 };
      counts[d.folder]!.total += 1;
      if (d.status === "Delivered") counts[d.folder]!.unread += 1;
    }
    return counts;
  }, [ledger.delivery, account]);
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
  const { account, ledger, disconnectWallet, balance } = useNumail();
  const counts = useFolderCounts();
  const mailbox = account ? ledger.mailboxes[account.address] : undefined;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      {account && (
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
          <p className="text-xs font-medium text-sidebar-foreground">{account.name}</p>
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
  const { connectWallet, useDemoAccount, useDevAccount, walletError } = useNumail();
  return (
    <div className="mx-auto w-full max-w-md surface-panel p-8 text-center">
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
  const [composeOpen, setComposeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const mailbox = account ? ledger.mailboxes[account.address] : undefined;
  const ready = Boolean(endpoint) && Boolean(account) && Boolean(mailbox);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          {ready && (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0">
                <SheetTitle className="px-4 pt-4 text-sm">NuMail</SheetTitle>
                <SidebarBody
                  {...(activeFolder ? { activeFolder } : {})}
                  {...(onSelectFolder ? { onSelectFolder } : {})}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
          )}

          <Link to="/" className="flex items-center gap-2">
            <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg">
              <Mail className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="text-base font-semibold tracking-tight">NuMail</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {rightSlot}
            {!endpoint ? (
              <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
                <SettingsIcon className="h-4 w-4" />
                Configure endpoint
              </Button>
            ) : (
              <ConnectionBadge />
            )}
            {ready && (
              <Button size="sm" onClick={() => setComposeOpen(true)}>
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
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
            <SidebarBody
              {...(activeFolder ? { activeFolder } : {})}
              {...(onSelectFolder ? { onSelectFolder } : {})}
            />
          </aside>
        )}

        <main className="min-w-0 flex-1">
          {!endpoint ? (
            <div className="mx-auto w-full max-w-2xl p-4 sm:p-8">
              <div className="surface-panel p-6">
                <h1 className="text-xl font-semibold tracking-tight">Configure your blockchain connection</h1>
                <p className="mt-1 mb-5 text-sm text-muted-foreground">
                  NuMail talks to a Substrate node over WebSocket. Choose a preset or enter your own endpoint, test it,
                  then continue.
                </p>
                <NetworkSettings />
              </div>
            </div>
          ) : !account ? (
            <div className="p-4 py-12 sm:p-8">
              <ConnectWalletScreen />
            </div>
          ) : !mailbox ? (
            <div className="p-4 py-12 sm:p-8">
              <CreateMailboxCard />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
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
