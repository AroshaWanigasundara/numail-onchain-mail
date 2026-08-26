import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { ComposeDialog } from "./ComposeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ArrowLeft,
  CheckCheck,
  FolderInput,
  Inbox,
  MailOpen,
  Paperclip,
  Reply,
  Search,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useNumail } from "@/lib/numail/provider";
import { blockToDate } from "@/lib/numail/ledger";
import type { DeliveryState, MailEnvelope } from "@/lib/numail/types";
import { GLOSSARY, Hint, StatusBadge, shortAddr } from "./shared";

const PAGE_SIZE = 12;

interface Row {
  delivery: DeliveryState;
  mail: MailEnvelope;
}

export function MailboxPage() {
  const { ledger, account, actions, busy } = useNumail();
  const [folder, setFolder] = useState("inbox");
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "tombstone" | "block"; value: string } | null>(null);

  const address = account?.address;
  const mailbox = address ? ledger.mailboxes[address] : undefined;

  const rows: Row[] = useMemo(() => {
    if (!address) return [];
    return ledger.delivery
      .filter((d) => d.account === address && d.folder === folder && d.status !== "Tombstoned")
      .map((d) => ({ delivery: d, mail: ledger.mail[d.mailId]! }))
      .filter((r) => Boolean(r.mail))
      .sort((a, b) => b.mail.block - a.mail.block);
  }, [ledger, address, folder]);

  const filtered = useMemo(() => {
    return rows.filter(({ delivery, mail }) => {
      const payload = ledger.payloads[mail.mailId];
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  const selectedRow = useMemo(
    () => (selected ? (rows.find((r) => r.mail.mailId === selected) ?? null) : null),
    [selected, rows],
  );

  const openMail = async (row: Row) => {
    setSelected(row.mail.mailId);
    if (row.delivery.status === "Delivered") {
      await actions.markRead(row.mail.mailId).catch(() => undefined);
    }
  };

  const thread = useMemo(() => {
    if (!selectedRow) return [] as MailEnvelope[];
    const rootId = selectedRow.mail.threadParent ?? selectedRow.mail.mailId;
    return Object.values(ledger.mail)
      .filter((m) => m.mailId === rootId || m.threadParent === rootId)
      .sort((a, b) => a.block - b.block);
  }, [selectedRow, ledger.mail]);

  return (
    <AppShell activeFolder={folder} onSelectFolder={setFolder}>
      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* list */}
        <section className={`border-r border-border ${selectedRow ? "hidden xl:block" : ""}`} aria-label="Mail list">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold capitalize">{folder}</h1>
              <span className="text-xs text-muted-foreground">{filtered.length} item(s)</span>
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
            <div className="flex flex-wrap gap-2">
              <Select value={readFilter} onValueChange={setReadFilter}>
                <SelectTrigger className="w-36" aria-label="Read status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From date" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To date" />
            </div>
          </div>

          {pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">No mail in this folder.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {pageRows.map((row) => {
                const payload = ledger.payloads[row.mail.mailId];
                const unread = row.delivery.status === "Delivered";
                return (
                  <li key={row.mail.mailId}>
                    <button
                      type="button"
                      onClick={() => void openMail(row)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent/60 ${
                        selected === row.mail.mailId ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-mono truncate text-xs ${unread ? "font-semibold" : "text-muted-foreground"}`}>
                          {shortAddr(row.mail.sender)}
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {blockToDate(row.mail.block, ledger.block).toLocaleDateString()}
                        </span>
                      </div>
                      <p className={`mt-1 truncate text-sm ${unread ? "font-semibold" : ""}`}>
                        {payload?.subject ?? `Encrypted subject ${row.mail.subjectHash.slice(0, 12)}…`}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <StatusBadge status={row.delivery.status} />
                        {row.mail.attachments.length > 0 && (
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has attachments" />
                        )}
                        {row.mail.threadParent && (
                          <Badge variant="outline" className="text-[10px]">
                            thread
                          </Badge>
                        )}
                        <span className="text-mono ml-auto text-[10px] text-muted-foreground">#{row.mail.block}</span>
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

        {/* detail */}
        <section className={selectedRow ? "" : "hidden xl:block"} aria-label="Mail detail">
          {!selectedRow ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
              <MailOpen className="h-8 w-8" />
              <p className="text-sm">Select a mail item to read it.</p>
            </div>
          ) : (
            <article className="p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" className="xl:hidden" onClick={() => setSelected(null)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <StatusBadge status={selectedRow.delivery.status} />
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {selectedRow.delivery.status === "Delivered" && (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void actions.markRead(selectedRow.mail.mailId)}>
                      <CheckCheck className="h-4 w-4" />
                      Mark read
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <FolderInput className="h-4 w-4" />
                        Move
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
                      {(mailbox?.folders ?? []).map((f) => (
                        <DropdownMenuItem
                          key={f}
                          className="capitalize"
                          onClick={() => void actions.moveToFolder(selectedRow.mail.mailId, f)}
                        >
                          {f}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="sm" variant="outline" onClick={() => setReplyTo(selectedRow)}>
                    <Reply className="h-4 w-4" />
                    Reply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirm({ kind: "block", value: selectedRow.mail.sender })}
                  >
                    <ShieldOff className="h-4 w-4" />
                    Block
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setConfirm({ kind: "tombstone", value: selectedRow.mail.mailId })}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              <h2 className="mt-4 text-xl font-semibold tracking-tight">
                {ledger.payloads[selectedRow.mail.mailId]?.subject ?? "Encrypted subject"}
              </h2>
              <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">From</dt>
                  <dd className="text-mono break-all">{selectedRow.mail.sender}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">To</dt>
                  <dd className="text-mono break-all">{selectedRow.mail.recipients.map((r) => shortAddr(r, 8)).join(", ")}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Date</dt>
                  <dd>
                    {blockToDate(selectedRow.mail.block, ledger.block).toLocaleString()} · block #{selectedRow.mail.block}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Subject hash</dt>
                  <dd className="text-mono break-all">{selectedRow.mail.subjectHash}</dd>
                </div>
                {selectedRow.mail.postage ? (
                  <div className="flex gap-2">
                    <dt className="flex w-20 shrink-0 items-center gap-1">
                      Postage <Hint>{GLOSSARY.postage}</Hint>
                    </dt>
                    <dd>{selectedRow.mail.postage}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {ledger.payloads[selectedRow.mail.mailId]?.body ?? (
                  <span className="text-muted-foreground">
                    This body was encrypted for another device. Only the body reference{" "}
                    <span className="text-mono">{selectedRow.mail.bodyRef}</span> is stored on chain.
                  </span>
                )}
              </div>

              {selectedRow.mail.attachments.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-medium">
                    Attachments <Hint>{GLOSSARY.anchored}</Hint>
                  </h3>
                  {selectedRow.mail.attachments.map((a) => (
                    <div key={a.cid} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{Math.round(a.size / 1024)} KB</span>
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-[10px] text-success">
                        anchored
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {thread.length > 1 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium">Conversation ({thread.length})</h3>
                  <ol className="mt-2 space-y-1.5 border-l-2 border-border pl-4">
                    {thread.map((m) => (
                      <li key={m.mailId}>
                        <button
                          type="button"
                          onClick={() => setSelected(m.mailId)}
                          className={`text-left text-xs ${
                            m.mailId === selectedRow.mail.mailId ? "font-semibold" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {ledger.payloads[m.mailId]?.subject ?? m.subjectHash} · {shortAddr(m.sender, 5)} · #{m.block}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </article>
          )}
        </section>
      </div>

      <ComposeDialog
        open={replyTo !== null}
        onOpenChange={(v) => !v && setReplyTo(null)}
        threadParent={replyTo?.mail.threadParent ?? replyTo?.mail.mailId}
        initialRecipients={replyTo ? [replyTo.mail.sender] : []}
        initialSubject={replyTo ? `Re: ${ledger.payloads[replyTo.mail.mailId]?.subject ?? ""}` : ""}
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
                else {
                  await actions.tombstone(confirm.value).catch(() => undefined);
                  setSelected(null);
                }
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
