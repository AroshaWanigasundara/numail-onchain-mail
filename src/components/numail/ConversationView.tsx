import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowUpDown,
  CheckCheck,
  ChevronDown,
  ChevronsUpDown,
  FolderInput,
  Paperclip,
  Reply,
  ReplyAll,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNumail } from "@/lib/numail/provider";
import { blockToDate } from "@/lib/numail/ledger";
import { canRestore, describeBlocks, restoreDeadline } from "@/lib/numail/archive";
import { mailExpiry } from "@/lib/numail/retention";
import { normalizeSubject, payloadFor, previewOf, replyRecipients, type MailRow } from "@/lib/numail/threads";
import { AddressAvatar } from "./AddressAvatar";
import { DeliveryReceipts } from "./DeliveryReceipts";
import { ExpiryNotice } from "./ExpiryBadge";
import { GLOSSARY, Hint, StatusBadge, shortAddr } from "./shared";
import { AddressName, useNames } from "./AddressName";

interface Props {
  /** every visible message of the thread, oldest first */
  messages: MailRow[];
  onBack: () => void;
  onReply: (message: MailRow, all: boolean) => void;
  onArchive: (mailId: string) => void;
  onConfirm: (c: { kind: "tombstone" | "block"; value: string }) => void;
}

export function ConversationView({ messages, onBack, onReply, onArchive, onConfirm }: Props) {
  const { ledger, account, actions } = useNumail();
  const newest = messages[messages.length - 1];
  const newestId = newest?.mail.mailId;

  const [newestFirst, setNewestFirst] = useState(true);
  const [open, setOpen] = useState<Set<string>>(() => new Set(newestId ? [newestId] : []));

  // a new reply arriving in the open thread is expanded automatically
  useEffect(() => {
    if (newestId) setOpen((s) => (s.has(newestId) ? s : new Set(s).add(newestId)));
  }, [newestId]);

  // Outlook-style: a message is marked read when it is displayed expanded (one attempt per mail)
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const m of messages) {
      const id = m.mail.mailId;
      if (m.archived || m.delivery.status !== "Delivered" || !open.has(id) || requested.current.has(id)) continue;
      requested.current.add(id);
      void actions.markRead(id).catch(() => undefined);
    }
  }, [open, messages, actions]);

  const ordered = useMemo(() => (newestFirst ? [...messages].reverse() : messages), [messages, newestFirst]);
  const allOpen = messages.length > 0 && messages.every((m) => open.has(m.mail.mailId));

  const me = account?.address;
  const participants = useMemo(() => {
    const s = new Set<string>();
    for (const { mail } of messages) for (const a of [mail.sender, ...mail.recipients]) if (a !== me) s.add(a);
    return s.size;
  }, [messages, me]);

  if (!newest) return null;
  const first = messages[0]!;
  const subject = normalizeSubject(payloadFor(ledger, first)?.subject ?? "Encrypted subject");

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="xl:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {messages.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setNewestFirst((v) => !v)}>
              <ArrowUpDown className="h-4 w-4" />
              {newestFirst ? "Newest first" : "Oldest first"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(allOpen ? new Set() : new Set(messages.map((m) => m.mail.mailId)))}
            >
              <ChevronsUpDown className="h-4 w-4" />
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          </div>
        )}
      </div>

      <h2 className="mt-3 text-xl font-semibold wrap-anywhere">{subject}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {messages.length} message{messages.length === 1 ? "" : "s"} · {participants} participant
        {participants === 1 ? "" : "s"}
      </p>

      <div className="mt-4 space-y-2.5">
        {ordered.map((m) => (
          <MessageCard
            key={m.mail.mailId}
            m={m}
            expanded={open.has(m.mail.mailId)}
            onToggle={() => toggle(m.mail.mailId)}
            onReply={onReply}
            onArchive={onArchive}
            onConfirm={onConfirm}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ one message */

interface CardProps {
  m: MailRow;
  expanded: boolean;
  onToggle: () => void;
  onReply: Props["onReply"];
  onArchive: Props["onArchive"];
  onConfirm: Props["onConfirm"];
}

function MessageCard({ m, expanded, onToggle, onReply, onArchive, onConfirm }: CardProps) {
  const { ledger, account, actions, busy, status, palletAvailable } = useNumail();
  const { resolve, named } = useNames();
  const address = account?.address ?? "";
  const mailbox = address ? ledger.mailboxes[address] : undefined;
  const { mail, delivery } = m;
  const arch = m.archived;
  const mine = mail.sender === address;
  const unread = delivery.status === "Delivered";
  const payload = payloadFor(ledger, m);
  const date = blockToDate(mail.block, ledger.block);

  const expiryLive = status === "connected" && palletAvailable && account?.source !== "demo";
  const expiry = expiryLive && !arch ? mailExpiry(mail.block, mailbox?.retention, ledger.block) : null;

  const restorable = arch ? arch.onChain && canRestore(arch.item, ledger.block) : false;
  const restoreNote = (() => {
    if (!arch) return "";
    const deadline = restoreDeadline(arch.item);
    if (!canRestore(arch.item, ledger.block)) {
      return `Retention period ended at block #${deadline}. This mail can no longer be moved out of the archive.`;
    }
    if (!arch.onChain) return "This mail now only exists in the .pst file. It is no longer on chain, so it can't be restored.";
    return deadline === null
      ? "No retention limit: you can restore this mail at any time."
      : `You can restore this mail until block #${deadline} (about ${describeBlocks(deadline - ledger.block)} from now).`;
  })();

  const folders = (mailbox?.folders ?? []).filter((f) => f !== "archive");
  const canReplyAll = replyRecipients(mail, address, true).length > replyRecipients(mail, address, false).length;
  const folderLabel = arch ? "archived" : delivery.folder;

  return (
    <article
      className={`overflow-hidden rounded-xl border transition-colors ${
        expanded ? "border-border bg-card shadow-sm" : "border-border/70 bg-muted/30 hover:bg-muted/50"
      } ${unread ? "border-l-4 border-l-primary" : ""}`}
    >
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <AddressAvatar address={mail.sender} name={named(mail.sender)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-mono truncate text-xs ${unread ? "font-semibold" : ""}`}>
              {mine ? "You" : resolve(mail.sender).label}
            </span>
            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            <Badge variant="outline" className="hidden shrink-0 text-[10px] capitalize sm:inline-flex">
              {folderLabel}
            </Badge>
            {mail.attachments.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" />}
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{date.toLocaleString()}</span>
          </div>
          {!expanded && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{previewOf(payload?.body) || "Encrypted message"}</p>
          )}
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <dt className="w-14 shrink-0">From</dt>
              <dd className="min-w-0">
                <AddressName address={mail.sender} className="font-medium text-foreground" />
                <span className="text-mono ml-2 text-[10px]">{shortAddr(mail.sender, 8)}</span>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0">To</dt>
              <dd className="flex min-w-0 flex-wrap gap-x-1.5">
                {mail.recipients
                  .filter((r) => r !== mail.sender || mail.recipients.length === 1)
                  .map((r, i, arr) => (
                    <span key={r} className="inline-flex max-w-full">
                      <AddressName address={r} className="text-foreground" />
                      {i < arr.length - 1 && ","}
                    </span>
                  ))}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0">Date</dt>
              <dd>
                {date.toLocaleString()} · block #{mail.block}
              </dd>
            </div>
            {mail.postage ? (
              <div className="flex gap-2">
                <dt className="flex w-14 shrink-0 items-center gap-1">
                  Postage <Hint>{GLOSSARY.postage}</Hint>
                </dt>
                <dd>{mail.postage}</dd>
              </div>
            ) : null}
          </dl>

          {arch && (
            <p
              className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                restorable ? "border-border text-muted-foreground" : "border-warning/40 bg-warning/10"
              }`}
            >
              {restoreNote}
            </p>
          )}

          {/* toolbar */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={delivery.status} />
            <Button size="sm" variant="outline" onClick={() => onReply(m, false)}>
              <Reply className="h-4 w-4" />
              Reply
            </Button>
            {canReplyAll && (
              <Button size="sm" variant="outline" onClick={() => onReply(m, true)}>
                <ReplyAll className="h-4 w-4" />
                Reply all
              </Button>
            )}

            {arch ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={!restorable || busy !== null}>
                    <ArchiveRestore className="h-4 w-4" />
                    Restore to…
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Restore to folder</DropdownMenuLabel>
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f}
                      className="capitalize"
                      onClick={() => void actions.restoreArchived(arch.archiveId, mail.mailId, f).catch(() => undefined)}
                    >
                      {f}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <FolderInput className="h-4 w-4" />
                      Move
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
                    {/* "archive" is reached through the Archive button so a .pst is always written */}
                    {folders.map((f) => (
                      <DropdownMenuItem
                        key={f}
                        className="capitalize"
                        onClick={() => void actions.moveToFolder(mail.mailId, f)}
                      >
                        {f}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => onArchive(mail.mailId)}>
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
              </>
            )}

            {unread && !arch && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void actions.markRead(mail.mailId)}>
                <CheckCheck className="h-4 w-4" />
                Mark read
              </Button>
            )}
            {!mine && (
              <Button size="sm" variant="outline" onClick={() => onConfirm({ kind: "block", value: mail.sender })}>
                <ShieldOff className="h-4 w-4" />
                Block
              </Button>
            )}
            {!arch && (
              <Button size="sm" variant="destructive" onClick={() => onConfirm({ kind: "tombstone", value: mail.mailId })}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>

          <div className="mt-4 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">
            {payload?.body ?? <span className="text-muted-foreground italic">Encrypted for another device</span>}
          </div>

          {mail.attachments.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                Attachments <Hint>{GLOSSARY.anchored}</Hint>
              </h3>
              {mail.attachments.map((a) => (
                <div key={a.cid} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{Math.round(a.size / 1024)} KB</span>
                  <Badge variant="outline" className="border-success/40 bg-success/10 text-[10px] text-success">
                    anchored
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {mine && <DeliveryReceipts key={mail.mailId} mail={mail} />}
          {expiry && mailbox?.retention ? <ExpiryNotice expiry={expiry} retention={mailbox.retention} /> : null}
        </div>
      )}
    </article>
  );
}
