import { Hourglass } from "lucide-react";
import { formatTimeLeft, type MailExpiry } from "@/lib/numail/retention";

const TONE = {
  calm: "border-border bg-muted/60 text-muted-foreground",
  soon: "border-warning/40 bg-warning/10 text-warning",
  urgent: "border-destructive/40 bg-destructive/10 text-destructive animate-pulse",
} as const;

const fullDate = (e: MailExpiry) =>
  `Deleted automatically at block #${e.expiryBlock} (about ${e.expiresAt.toLocaleString()})`;

/** Compact pill for list rows. */
export function ExpiryBadge({ expiry }: { expiry: MailExpiry }) {
  return (
    <span
      title={fullDate(expiry)}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${TONE[expiry.urgency]}`}
    >
      <Hourglass className="h-3 w-3" />
      {formatTimeLeft(expiry.secondsLeft)}
    </span>
  );
}

/** Fuller notice for the open mail, with a "life remaining" bar. */
export function ExpiryNotice({ expiry, retention }: { expiry: MailExpiry; retention: number }) {
  const remaining = Math.min(100, Math.max(0, (expiry.blocksLeft / retention) * 100));
  const bar =
    expiry.urgency === "urgent" ? "bg-destructive" : expiry.urgency === "soon" ? "bg-warning" : "bg-muted-foreground/60";
  return (
    <div className={`mt-4 rounded-lg border px-4 py-3 ${TONE[expiry.urgency].replace("animate-pulse", "")}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Hourglass className="h-4 w-4 shrink-0" />
        Deleted automatically in {formatTimeLeft(expiry.secondsLeft)}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${remaining}%` }} />
      </div>
      <p className="mt-1.5 text-xs opacity-80">
        Your retention policy removes this mail from your mailbox at block #{expiry.expiryBlock} (about{" "}
        {expiry.expiresAt.toLocaleString()}). The on-chain record of it remains.
      </p>
    </div>
  );
}
