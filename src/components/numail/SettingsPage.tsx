import { useState } from "react";
import { AppShell } from "./AppShell";
import { NetworkSettings } from "./NetworkSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, ShieldOff, Trash2 } from "lucide-react";
import { CONSTANTS, type MailboxPolicy, type PolicyKind } from "@/lib/numail/types";
import { useNumail } from "@/lib/numail/provider";
import { GLOSSARY, Hint, policyLabel, shortAddr } from "./shared";

export function SettingsPage() {
  const { ledger, account, actions, busy, balance } = useNumail();
  const mailbox = account ? ledger.mailboxes[account.address] : undefined;
  const blocklist = account ? (ledger.blocklists[account.address] ?? []) : [];

  const [kind, setKind] = useState<PolicyKind>(mailbox?.policy.kind ?? "Open");
  const [trust, setTrust] = useState(String(mailbox?.policy.minTrustScore ?? 50));
  const [postage, setPostage] = useState(String(mailbox?.policy.postage ?? 500));
  const [retention, setRetention] = useState(mailbox?.retention ? String(mailbox.retention) : "");
  const [newFolder, setNewFolder] = useState("");
  const [blockInput, setBlockInput] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  const savePolicy = async () => {
    const policy: MailboxPolicy = { kind };
    if (kind === "MinTrustScore") policy.minTrustScore = Number(trust) || 0;
    if (kind === "PostageRequired") policy.postage = Number(postage) || 0;
    await actions.setPolicy(policy, retention ? Number(retention) : undefined).catch(() => undefined);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Network, mailbox policy, folders, blocklist and chain constants.</p>
        </div>

        <Tabs defaultValue="network">
          <TabsList className="flex-wrap">
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="mailbox">Mailbox</TabsTrigger>
            <TabsTrigger value="blocklist">Blocklist</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          <TabsContent value="network" className="mt-4">
            <div className="surface-panel p-5">
              <h2 className="mb-4 text-lg font-semibold">Network settings</h2>
              <NetworkSettings />
            </div>
          </TabsContent>

          <TabsContent value="mailbox" className="mt-4 space-y-4">
            <div className="surface-panel space-y-4 p-5">
              <h2 className="text-lg font-semibold">Acceptance policy</h2>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Policy <Hint>{GLOSSARY.policy}</Hint>
                </Label>
                <Select value={kind} onValueChange={(v) => setKind(v as PolicyKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="ContactsOnly">Contacts only</SelectItem>
                    <SelectItem value="MinTrustScore">Minimum trust score</SelectItem>
                    <SelectItem value="PostageRequired">Postage required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {kind === "MinTrustScore" && (
                <div className="space-y-2">
                  <Label htmlFor="trust">Minimum trust score</Label>
                  <Input id="trust" type="number" value={trust} onChange={(e) => setTrust(e.target.value)} />
                </div>
              )}
              {kind === "PostageRequired" && (
                <div className="space-y-2">
                  <Label htmlFor="postage" className="flex items-center gap-1.5">
                    Required postage <Hint>{GLOSSARY.postage}</Hint>
                  </Label>
                  <Input id="postage" type="number" value={postage} onChange={(e) => setPostage(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="retention" className="flex items-center gap-1.5">
                  Retention window (blocks) <Hint>{GLOSSARY.retention}</Hint>
                </Label>
                <Input id="retention" type="number" value={retention} onChange={(e) => setRetention(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={savePolicy} disabled={busy !== null}>
                  {busy === "set_mailbox_policy" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save policy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Current on-chain policy: {mailbox ? policyLabel(mailbox.policy) : "—"}</p>
            </div>

            <div className="surface-panel space-y-3 p-5">
              <h2 className="text-lg font-semibold">Folders</h2>
              <div className="flex flex-wrap gap-1.5">
                {(mailbox?.folders ?? []).map((f) => (
                  <Badge key={f} variant="secondary" className="capitalize">
                    {f}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newFolder}
                  placeholder="New folder name"
                  onChange={(e) => setNewFolder(e.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={busy !== null || !newFolder.trim()}
                  onClick={async () => {
                    await actions.addFolder(newFolder.trim().toLowerCase()).catch(() => undefined);
                    setNewFolder("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add folder
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {(mailbox?.folders.length ?? 0)} of {CONSTANTS.MaxFolders} folders declared.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="blocklist" className="mt-4">
            <div className="surface-panel space-y-4 p-5">
              <h2 className="text-lg font-semibold">Blocked senders</h2>
              <div className="flex gap-2">
                <Input
                  value={blockInput}
                  spellCheck={false}
                  placeholder="Account address to block"
                  className="text-mono text-sm"
                  onChange={(e) => setBlockInput(e.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={busy !== null || !blockInput.trim()}
                  onClick={async () => {
                    await actions.blockSender(blockInput.trim()).catch(() => undefined);
                    setBlockInput("");
                  }}
                >
                  <ShieldOff className="h-4 w-4" />
                  Block
                </Button>
              </div>
              {blocklist.length === 0 ? (
                <p className="text-sm text-muted-foreground">No blocked senders.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {blocklist.map((addr) => (
                    <li key={addr} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="text-mono flex-1 truncate">{addr}</span>
                      <Button size="sm" variant="ghost" onClick={() => void actions.unblockSender(addr)}>
                        Unblock
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Up to {CONSTANTS.MaxBlocklist} entries. Blocked senders receive a <code className="text-mono">SenderBlocked</code> error.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="account" className="mt-4 space-y-4">
            <div className="surface-panel space-y-2 p-5 text-sm">
              <h2 className="mb-2 text-lg font-semibold">Account</h2>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Address</span>
                <span className="text-mono break-all text-right">{account ? shortAddr(account.address, 10) : "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Balance</span>
                <span>{balance ?? "unavailable on this node"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Mailbox created</span>
                <span>{mailbox ? new Date(mailbox.createdAt).toLocaleString() : "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Created at block</span>
                <span className="text-mono">#{mailbox?.createdAtBlock ?? "—"}</span>
              </div>
            </div>

            <div className="surface-panel p-5">
              <h2 className="mb-3 text-lg font-semibold">Pallet constants</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {Object.entries(CONSTANTS).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border p-2">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="text-mono">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="surface-panel p-5">
              <h2 className="text-lg font-semibold">Danger zone</h2>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">
                Clear the locally cached NuMail state (mailboxes, mail, decrypted payloads) on this device.
              </p>
              <Button variant="destructive" onClick={() => setResetOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Clear local state
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear local NuMail state?</AlertDialogTitle>
            <AlertDialogDescription>
              Your mailbox, folders and decrypted message bodies cached on this device will be removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={actions.resetChainData}>Clear state</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
