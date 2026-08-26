import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Paperclip, Plus, Send, X } from "lucide-react";
import { CONSTANTS, type Attachment } from "@/lib/numail/types";
import { useNumail } from "@/lib/numail/provider";
import { GLOSSARY, Hint, policyLabel, shortAddr } from "./shared";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  threadParent?: string | undefined;
  initialRecipients?: string[];
  initialSubject?: string;
}

export function ComposeDialog({ open, onOpenChange, threadParent, initialRecipients, initialSubject }: Props) {
  const { ledger, actions, busy, account, status } = useNumail();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [postage, setPostage] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecipients(initialRecipients ?? []);
    setSubject(initialSubject ?? "");
    setBody("");
    setAttachments([]);
    setError(null);
    setRecipientInput("");
  }, [open, initialRecipients, initialSubject]);

  const knownAccounts = useMemo(
    () => Object.keys(ledger.mailboxes).filter((a) => a !== account?.address),
    [ledger.mailboxes, account],
  );

  const requiredPostage = useMemo(
    () =>
      recipients.reduce((max, r) => {
        const p = ledger.mailboxes[r]?.policy;
        return p?.kind === "PostageRequired" ? Math.max(max, p.postage ?? 0) : max;
      }, 0),
    [recipients, ledger.mailboxes],
  );

  useEffect(() => {
    if (requiredPostage > 0) setPostage(String(requiredPostage));
  }, [requiredPostage]);

  const addRecipient = (value?: string) => {
    const addr = (value ?? recipientInput).trim();
    if (!addr) return;
    if (recipients.includes(addr)) return;
    if (recipients.length >= CONSTANTS.MaxRecipients) {
      setError(`A single mail may carry at most ${CONSTANTS.MaxRecipients} recipients.`);
      return;
    }
    setRecipients((r) => [...r, addr]);
    setRecipientInput("");
    setError(null);
  };

  const addAttachment = () => {
    if (attachments.length >= CONSTANTS.MaxAttachments) {
      setError(`At most ${CONSTANTS.MaxAttachments} attachments per mail.`);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setAttachments((a) => [
        ...a,
        {
          name: file.name,
          size: file.size,
          cid: `0x${Math.random().toString(16).slice(2, 18)}`,
          anchored: true,
        },
      ]);
    };
    input.click();
  };

  const send = async () => {
    setError(null);
    if (recipients.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required — it is hashed on chain and encrypted off chain.");
      return;
    }
    try {
      const id = await actions.sendMail({
        recipients,
        subject: subject.trim(),
        body,
        attachments,
        threadParent,
        postage: Number(postage) || 0,
      });
      if (id) onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const offline = status !== "connected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{threadParent ? "Reply" : "New mail"}</DialogTitle>
          <DialogDescription>
            The subject and body are encrypted on this device; only their hash and reference go on chain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipients">Recipients ({recipients.length}/{CONSTANTS.MaxRecipients})</Label>
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
            <div className="flex gap-2">
              <Input
                id="recipients"
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
                    {shortAddr(a, 5)} · {policyLabel(ledger.mailboxes[a]!.policy)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={CONSTANTS.MaxSubjectBytes} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea id="body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Attachments <Hint>{GLOSSARY.anchored}</Hint>
            </Label>
            <div className="space-y-1.5">
              {attachments.map((a, i) => (
                <div key={`${a.cid}-${i}`} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{a.name}</span>
                  <Badge variant="outline" className="border-success/40 bg-success/10 text-[10px] text-success">
                    DNC anchored
                  </Badge>
                  <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addAttachment}>
              <Paperclip className="h-4 w-4" />
              Attach file ({attachments.length}/{CONSTANTS.MaxAttachments})
            </Button>
          </div>

          {requiredPostage > 0 && (
            <div className="space-y-2">
              <Label htmlFor="postage" className="flex items-center gap-1.5">
                Postage <Hint>{GLOSSARY.postage}</Hint>
              </Label>
              <Input id="postage" type="number" min={0} value={postage} onChange={(e) => setPostage(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                A recipient policy requires at least {requiredPostage}. It is refunded when they mark the mail read.
              </p>
            </div>
          )}

          {threadParent && (
            <p className="text-xs text-muted-foreground">
              Replying in thread <span className="text-mono">{shortAddr(threadParent, 8)}</span>
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {offline && (
            <Alert>
              <AlertDescription>
                You are offline from the node — sending is disabled until the connection is restored.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy !== null || offline}>
            {busy === "send_mail" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send mail
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
