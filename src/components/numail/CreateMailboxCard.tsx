import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X } from "lucide-react";
import { CONSTANTS, DEFAULT_FOLDERS, type MailboxPolicy, type PolicyKind } from "@/lib/numail/types";
import { useNumail } from "@/lib/numail/provider";
import { GLOSSARY, Hint } from "./shared";

export function CreateMailboxCard() {
  const { actions, busy } = useNumail();
  const [kind, setKind] = useState<PolicyKind>("Open");
  const [trust, setTrust] = useState("50");
  const [postage, setPostage] = useState("500");
  const [retention, setRetention] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [folderInput, setFolderInput] = useState("");

  const addFolder = () => {
    const name = folderInput.trim().toLowerCase();
    if (!name) return;
    if (DEFAULT_FOLDERS.includes(name) || folders.includes(name)) return;
    if (folders.length + DEFAULT_FOLDERS.length >= CONSTANTS.MaxFolders) return;
    setFolders((f) => [...f, name]);
    setFolderInput("");
  };

  const submit = async () => {
    const policy: MailboxPolicy = { kind };
    if (kind === "MinTrustScore") policy.minTrustScore = Number(trust) || 0;
    if (kind === "PostageRequired") policy.postage = Number(postage) || 0;
    await actions
      .createMailbox(policy, retention ? Number(retention) : undefined, folders)
      .catch(() => undefined);
  };

  return (
    <div className="mx-auto w-full max-w-xl surface-panel p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Create your mailbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A mailbox registers your acceptance policy and folders on chain. This is a one-time <code className="text-mono text-xs">create_mailbox</code> extrinsic.
      </p>

      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            Acceptance policy <Hint>{GLOSSARY.policy}</Hint>
          </Label>
          <Select value={kind} onValueChange={(v) => setKind(v as PolicyKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Open">Open — anyone can write to me</SelectItem>
              <SelectItem value="ContactsOnly">Contacts only — prior correspondents</SelectItem>
              <SelectItem value="MinTrustScore">Minimum trust score</SelectItem>
              <SelectItem value="PostageRequired">Postage required</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {kind === "MinTrustScore" && (
          <div className="space-y-2">
            <Label htmlFor="trust">Minimum trust score</Label>
            <Input id="trust" type="number" min={0} value={trust} onChange={(e) => setTrust(e.target.value)} />
          </div>
        )}

        {kind === "PostageRequired" && (
          <div className="space-y-2">
            <Label htmlFor="postage" className="flex items-center gap-1.5">
              Required postage <Hint>{GLOSSARY.postage}</Hint>
            </Label>
            <Input id="postage" type="number" min={0} value={postage} onChange={(e) => setPostage(e.target.value)} />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="retention" className="flex items-center gap-1.5">
            Retention window (blocks, optional) <Hint>{GLOSSARY.retention}</Hint>
          </Label>
          <Input
            id="retention"
            type="number"
            min={0}
            placeholder="e.g. 432000"
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="folder">Folders</Label>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_FOLDERS.map((f) => (
              <Badge key={f} variant="secondary" className="capitalize">
                {f}
              </Badge>
            ))}
            {folders.map((f) => (
              <Badge key={f} variant="outline" className="gap-1 capitalize">
                {f}
                <button type="button" aria-label={`Remove ${f}`} onClick={() => setFolders((x) => x.filter((y) => y !== f))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              id="folder"
              value={folderInput}
              placeholder="Add a custom folder"
              onChange={(e) => setFolderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFolder();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addFolder}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            inbox, sent and archive are always declared. Up to {CONSTANTS.MaxFolders} folders total.
          </p>
        </div>

        <Button className="w-full" onClick={submit} disabled={busy !== null}>
          {busy === "create_mailbox" && <Loader2 className="h-4 w-4 animate-spin" />}
          Create mailbox
        </Button>
      </div>
    </div>
  );
}
