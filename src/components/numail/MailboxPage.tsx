import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Inbox, KeyRound, MailOpen, MessagesSquare, Paperclip, Save, Search } from "lucide-react";
import { AppShell } from "./AppShell";
import { ComposeDialog } from "./ComposeDialog";
import { ArchiveDialog } from "./ArchiveDialog";
import { ConversationView } from "./ConversationView";
import { AddressAvatar } from "./AddressAvatar";
import { ExpiryBadge } from "./ExpiryBadge";
import { GLOSSARY, shortAddr } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useNumail } from "@/lib/numail/provider";
import { blockToDate } from "@/lib/numail/ledger";
import { ARCHIVE_PREFIX } from "@/lib/numail/archive";
import { loadKeyPair } from "@/lib/numail/keys";
import { mailExpiry } from "@/lib/numail/retention";
import {
  groupConversations,
  messagesOfThread,
  normalizeSubject,
  payloadFor,
  previewOf,
  replyRecipients,
  replySubject,
  threadRootId,
  type MailRow,
} from "@/lib/numail/threads";

const PAGE_SIZE = 12;

export function MailboxPage() {
  const { ledger, account, actions, archives, status, palletAvailable } = useNumail();
  const [folder, setFolder] = useState("inbox");
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  /** conversation key (thread root id); in an archive folder it is the mail id */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reply, setReply] = useState<{ message: MailRow; all: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "tombstone" | "block"; value: string } | null>(null);
  const [archiveFor, setArchiveFor] = useState<string | null>(null);

  const address = account?.address;
  const mailbox = address ? ledger.mailboxes[address] : undefined;

  // Auto-expiry is done by the pallet's on_initialize hook, so only show it on a real chain
  // (the demo ledger never expires mail) and not for offline .pst archive items.
  const expiryLive = status === "connected" && palletAvailable && account?.source !== "demo";
  const expiryOf = (row: MailRow) =>
    expiryLive && !row.archived ? mailExpiry(row.mail.block, mailbox?.retention, ledger.block) : null;

  const archiveId = folder.startsWith(ARCHIVE_PREFIX) ? folder.slice(ARCHIVE_PREFIX.length) : null;
  const activeArchive = archiveId ? archives.find((a) => a.id === archiveId) : undefined;
  const archivedIds = useMemo(() => new Set(archives.flatMap((a) => a.items.map((i) => i.mailId))), [archives]);

  // closing the open archive folder drops you back to the inbox
  useEffect(() => {
    if (archiveId && !activeArchive) setFolder("inbox");
  }, [archiveId, activeArchive]);

  // keys differ between archive view (mail id) and normal folders (thread root), so reset on switch
  useEffect(() => setSelectedKey(null), [folder]);

  const rows: MailRow[] = useMemo(() => {
    if (!address) return [];
    if (activeArchive) {
      return activeArchive.items
        .map((item): MailRow => {
          const live = ledger.delivery.find(
            (d) => d.account === address && d.mailId === item.mailId && d.status !== "Tombstoned",
          );
          return {
            delivery: { mailId: item.mailId, account: address, status: "Archived", folder },
            mail: ledger.mail[item.mailId] ?? item.envelope,
            archived: { archiveId: activeArchive.id, item, onChain: Boolean(live) },
          };
        })
        .sort((a, b) => b.mail.block - a.mail.block);
    }
    return ledger.delivery
      .filter((d) => d.account === address && d.folder === folder && d.status !== "Tombstoned")
      // mail filed in a named archive folder is shown there, not in the plain "archive" list
      .filter((d) => !(d.folder === "archive" && archivedIds.has(d.mailId)))
      .map((d) => ({ delivery: d, mail: ledger.mail[d.mailId]! }))
      .filter((r) => Boolean(r.mail))
      .sort((a, b) => b.mail.block - a.mail.block);
  }, [ledger, address, folder, activeArchive, archivedIds]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const { delivery, mail } = row;
      const payload = payloadFor(ledger, row);
      const haystack = `${mail.sender} ${mail.recipients.join(" ")} ${payload?.subject ?? ""}`.toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (readFilter === "unread" && delivery.status !== "Delivered") return false;
      if (readFilter === "read" && delivery.status === "Delivered") return false;
      const date = blockToDate(mail.block, ledger.block);
      if (from && date < new Date(from)) return false;
      if (to && date > new Date(`${to}T23:59:59`)) return false;
      return true;
    });
  }, [rows, query, readFilter, from, to, ledger]);

  // one list entry per conversation (archive folders stay one entry per item)
  const conversations = useMemo(
    () => groupConversations(filtered, ledger.mail, ledger.delivery, address ?? "", !activeArchive),
    [filtered, ledger.mail, ledger.delivery, address, activeArchive],
  );

  const pageCount = Math.max(1, Math.ceil(conversations.length / PAGE_SIZE));
  const pageItems = conversations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [folder, query, readFilter, from, to]);

  // real-time event feed → toast on newly delivered mail
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const latest = ledger.events[0];
    if (!latest) return;
    if (seen.current === null) {
      seen.current = latest.id;
      return;
    }
    if (seen.current === latest.id) return;
    seen.current = latest.id;
    if (latest.type === "MailDelivered" && latest.mailId && ledger.mail[latest.mailId]?.sender !== address) {
      toast("New mail delivered", { description: ledger.payloads[latest.mailId]?.subject ?? latest.detail });
    }
  }, [ledger.events, ledger.mail, ledger.payloads, address]);

  // every visible message of the open conversation — across folders, like Outlook's conversation view
  const selectedMessages = useMemo((): MailRow[] => {
    if (!selectedKey || !address) return [];
    if (activeArchive) {
      const row = rows.find((r) => r.mail.mailId === selectedKey);
      return row ? [row] : [];
    }
    return messagesOfThread(selectedKey, ledger.mail, ledger.delivery, address);
  }, [selectedKey, address, activeArchive, rows, ledger.mail, ledger.delivery]);

  // the last message was deleted / restored away: close the pane
  useEffect(() => {
    if (selectedKey && selectedMessages.length === 0) setSelectedKey(null);
  }, [selectedKey, selectedMessages.length]);

  // Stable reply inputs: recomputed only when a different reply is started, NOT on every synced
  // block, so the compose dialog never sees new array identities while the user types.
  const replyInit = useMemo(() => {
    if (!reply || !address) return null;
    return {
      threadParent: threadRootId(reply.message.mail, ledger.mail),
      recipients: replyRecipients(reply.message.mail, address, reply.all),
      subject: replySubject(payloadFor(ledger, reply.message)?.subject ?? ""),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply, address]);

  const missingKey = useMemo(
    () => Boolean(address && mailbox && !loadKeyPair(address)),
    // ledger.payloads changes after a sync, which happens right after a key import
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, mailbox, ledger.payloads],
  );

  return (
    <AppShell activeFolder={folder} onSelectFolder={setFolder}>
      {missingKey && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <KeyRound className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            This device doesn't have your encryption key, so your mail can't be decrypted. Import your key backup to
            continue.
          </span>
          <Button asChild size="sm" variant="outline" className="col-start-2 w-fit">
            <Link to="/settings">Import key</Link>
          </Button>
        </div>
      )}

      <div className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* list */}
        <section className={`min-w-0 border-r border-border ${selectedKey ? "hidden xl:block" : ""}`} aria-label="Mail list">
          <div className="space-y-3 border-b border-border p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <h1 className={`truncate text-lg font-semibold ${activeArchive ? "" : "capitalize"}`}>
                {activeArchive ? activeArchive.name : folder}
              </h1>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {conversations.length} {activeArchive ? "item(s)" : "conversation(s)"}
                </span>
                {activeArchive && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void actions.savePst(activeArchive.id).catch(() => undefined)}
                    >
                      <Save className="h-4 w-4" />
                      Save .pst
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => actions.closeArchive(activeArchive.id)}>
                      Close
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sender or subject"
                className="pl-9"
                aria-label="Search mail"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Select value={readFilter} onValueChange={setReadFilter}>
                <SelectTrigger className="col-span-2 w-full min-w-0 sm:col-span-1" aria-label="Read status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full min-w-0" aria-label="From date" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full min-w-0" aria-label="To date" />
            </div>
          </div>

          {pageItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">No mail in this folder.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {pageItems.map((c) => {
                const row = c.latest;
                const payload = payloadFor(ledger, row);
                const unread = c.unread > 0;
                const soonest = c.rows
                  .map(expiryOf)
                  .filter((e): e is NonNullable<ReturnType<typeof expiryOf>> => e !== null)
                  .sort((a, b) => a.secondsLeft - b.secondsLeft)[0];
                const who = c.participants.length
                  ? c.participants.slice(0, 3).map((a) => shortAddr(a, 5)).join(", ") +
                    (c.participants.length > 3 ? ` +${c.participants.length - 3}` : "")
                  : "Me";
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(c.key)}
                      className={`grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 ${
                        selectedKey === c.key ? "bg-accent" : ""
                      }`}
                    >
                      <AddressAvatar address={c.participants[0] ?? address ?? row.mail.sender} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-mono truncate text-xs ${unread ? "font-semibold" : "text-muted-foreground"}`}>
                            {folder === "sent" ? `To: ${who}` : who}
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {blockToDate(row.mail.block, ledger.block).toLocaleDateString()}
                          </span>
                        </div>
                        <p className={`mt-0.5 truncate text-sm ${unread ? "font-semibold" : ""}`}>
                          {normalizeSubject(payload?.subject ?? "Encrypted subject")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {previewOf(payload?.body) || "Encrypted message"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {c.count > 1 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <MessagesSquare className="h-3 w-3" />
                              {c.count}
                            </span>
                          )}
                          {unread && (
                            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                              {c.unread} new
                            </span>
                          )}
                          {c.hasAttachments && (
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has attachments" />
                          )}
                          {soonest && <ExpiryBadge expiry={soonest} />}
                          <span className="text-mono ml-auto text-[10px] text-muted-foreground">#{row.mail.block}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 p-4">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </section>

        {/* detail: the whole conversation */}
        <section className={selectedKey ? "min-w-0" : "hidden min-w-0 xl:block"} aria-label="Conversation">
          {selectedMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
              <MailOpen className="h-8 w-8" />
              <p className="text-sm">Select a conversation to read it.</p>
            </div>
          ) : (
            <ConversationView
              key={selectedKey}
              messages={selectedMessages}
              onBack={() => setSelectedKey(null)}
              onReply={(message, all) => setReply({ message, all })}
              onArchive={setArchiveFor}
              onConfirm={setConfirm}
            />
          )}
        </section>
      </div>

      <ComposeDialog
        open={reply !== null}
        onOpenChange={(v) => !v && setReply(null)}
        threadParent={replyInit?.threadParent}
        initialRecipients={replyInit?.recipients}
        initialSubject={replyInit?.subject}
      />

      <ArchiveDialog
        open={archiveFor !== null}
        onOpenChange={(v) => !v && setArchiveFor(null)}
        mailId={archiveFor}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "block" ? "Block this sender?" : "Tombstone this mail?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "block"
                ? "Future mail from this address will be refused by the pallet with SenderBlocked."
                : GLOSSARY.tombstone}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirm) return;
                if (confirm.kind === "block") await actions.blockSender(confirm.value).catch(() => undefined);
                else await actions.tombstone(confirm.value).catch(() => undefined);
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
