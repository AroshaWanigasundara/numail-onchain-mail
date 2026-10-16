import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BellRing, Loader2, Plus, X } from "lucide-react";
import { CONSTANTS } from "@/lib/numail/types";
import { useNumail } from "@/lib/numail/provider";
import { shortAddr } from "./shared";

// Well-known //Alice address (sudo key on the dev genesis) — a convenience for testing.
const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SystemNoticeDialog({ open, onOpenChange }: Props) {
  const { ledger, actions, busy, status, palletAvailable } = useNumail();
  const [sender, setSender] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [threadParent, setThreadParent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSender("");
    setRecipients([]);
    setRecipientInput("");
    setSubject("");
    setBody("");
    setThreadParent("");
    setError(null);
  }, [open]);

  const knownAccounts = useMemo(() => Object.keys(ledger.mailboxes), [ledger.mailboxes]);

  const addRecipient = (value?: string) => {
    const addr = (value ?? recipientInput).trim();
    if (!addr || recipients.includes(addr)) return;
    if (recipients.length >= CONSTANTS.MaxRecipients) {
      setError(`A single notice may carry at most ${CONSTANTS.MaxRecipients} recipients.`);
      return;
    }
    setRecipients((r) => [...r, addr]);
    setRecipientInput("");
    setError(null);
  };

  const send = async () => {
    setError(null);
    if (!sender.trim()) return setError("Sender is required — the chain does not infer it for system notices.");
    if (recipients.length === 0) return setError("Add at least one recipient.");
    if (!subject.trim()) return setError("Subject is required.");
    if (threadParent.trim() && !/^\d+$/.test(threadParent.trim())) {
      return setError("Thread parent must be a numeric mail id.");
    }
    try {
      const id = await actions.systemNotice({
        sender: sender.trim(),
        recipients,
        subject: subject.trim(),
        body,
        threadParent: threadParent.trim() || undefined,
      });
      if (id !== undefined) onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const unavailable = status !== "connected" || !palletAvailable;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test system notice</DialogTitle>
          <DialogDescription>
            Calls <span className="text-mono">nuMail.systemNotice</span> through <span className="text-mono">sudo.sudo</span>.
            It skips blocklist and acceptance policy, but every recipient must already have a mailbox. Subject and body
            are encrypted on this device exactly like a normal mail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sn-sender">Sender</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                id="sn-sender"
                value={sender}
                placeholder="Any SS58 address, e.g. a pallet account"
                spellCheck={false}
                className="text-mono text-sm"
                onChange={(e) => setSender(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={() => setSender(ALICE)}>
                Use Alice
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sn-recipients">Recipients ({recipients.length}/{CONSTANTS.MaxRecipients})</Label>
            <div className="flex flex-wrap gap-1.5">
              {recipients.map((r) => (
                <Badge key={r} variant="secondary" className="text-mono gap-1 text-[11px]">
                  {shortAddr(r)}
                  <button type="button" aria-label={`Remove ${r}`} onClick={() => setRecipients((x) => x.filter((y) => y !== r))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                id="sn-recipients"
                value={recipientInput}
                placeholder="Paste an SS58 account address"
                spellCheck={false}
                className="text-mono text-sm"
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={() => addRecipient()}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {knownAccounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Known mailboxes:</span>
                {knownAccounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => addRecipient(a)}
                    className="text-mono rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-accent"
                  >
                    {shortAddr(a, 5)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sn-subject">Subject</Label>
            <Input id="sn-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={CONSTANTS.MaxSubjectBytes} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sn-body">Message</Label>
            <Textarea id="sn-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the notice…" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sn-thread">Thread parent (optional)</Label>
            <Input id="sn-thread" value={threadParent} inputMode="numeric" placeholder="Mail id, leave empty for none" onChange={(e) => setThreadParent(e.target.value)} />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {unavailable && (
            <Alert>
              <AlertDescription>Not connected to a node with pallet-numail — sending is disabled.</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy !== null || unavailable}>
            {busy === "system_notice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            Send notice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
