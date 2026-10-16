import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNumail } from "@/lib/numail/provider";
import type { DeliveryStatus, MailEnvelope } from "@/lib/numail/types";
import { Hint, shortAddr } from "./shared";

type Receipt = "Delivered" | "Read" | null;

/**
 * The sender only needs two states. Archived / Tombstoned mean the recipient has
 * already acted on the mail, so they are shown as Read.
 */
const toReceipt = (s: DeliveryStatus | null | undefined): Receipt => (!s ? null : s === "Delivered" ? "Delivered" : "Read");

const hue = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

function ReceiptPill({ receipt }: { receipt: Receipt }) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors";
  if (receipt === "Read") {
    return (
      <span className={`${base} border-success/40 bg-success/10 text-success`}>
        <CheckCheck className="h-3.5 w-3.5" />
        Read
      </span>
    );
  }
  if (receipt === "Delivered") {
    return (
      <span className={`${base} border-info/40 bg-info/10 text-info`}>
        <Check className="h-3.5 w-3.5" />
        Delivered
      </span>
    );
  }
  return (
    <span className={`${base} border-border bg-muted text-muted-foreground`}>
      <Clock className="h-3.5 w-3.5" />
      No record
    </span>
  );
}

export function DeliveryReceipts({ mail }: { mail: MailEnvelope }) {
  const { actions, ledger, status, palletAvailable, account } = useNumail();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // everyone except the sender (the sender is only in `recipients` for the self-wrapped key)
  const recipients = useMemo(
    () => Array.from(new Set(mail.recipients.filter((r) => r !== mail.sender))),
    [mail.recipients, mail.sender],
  );
  const recipientsKey = recipients.join(",");
  const live = status === "connected" && palletAvailable && account?.source !== "demo";

  const [map, setMap] = useState<Record<string, DeliveryStatus | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (recipients.length === 0) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    setError(null);
    actionsRef.current
      .watchDeliveryStatuses(mail.mailId, recipients, (next) => {
        if (!cancelled) setMap(next);
      })
      .then((u) => {
        if (cancelled) u();
        else unsub = u;
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // recipientsKey stands in for `recipients`; local mode re-reads when the simulated ledger changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mail.mailId, recipientsKey, nonce, live, live ? null : ledger.delivery]);

  if (recipients.length === 0) {
    return (
      <p className="mt-5 rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        This mail was only sent to you, so there are no delivery receipts.
      </p>
    );
  }

  const rows = recipients.map((address) => ({ address, receipt: toReceipt(map?.[address]) }));
  const total = rows.length;
  const read = rows.filter((r) => r.receipt === "Read").length;

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card" aria-label="Delivery status">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          Delivery status
          <Hint>
            Read straight from the chain. Delivered means the mail is in the recipient's mailbox. Read means they opened
            it; mail they have since archived or deleted also counts as read.
          </Hint>
        </h3>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {live ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Live
            </span>
          ) : (
            <span>Local data</span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Refresh delivery status"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {error ? (
        <div className="flex items-center gap-3 px-4 py-4 text-sm">
          <span className="min-w-0 flex-1 text-destructive">Couldn't read delivery status: {error}</span>
          <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)}>
            Retry
          </Button>
        </div>
      ) : map === null ? (
        <div className="space-y-2 px-4 py-4">
          {recipients.map((r) => (
            <Skeleton key={r} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium">{read === total ? "Read by everyone" : `${read} of ${total} read`}</span>
              {total - read > 0 && <span className="text-muted-foreground">{total - read} waiting</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-all duration-500"
                style={{ width: `${(read / total) * 100}%` }}
              />
            </div>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {rows.map(({ address, receipt }) => (
              <li key={address} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: `hsl(${hue(address)} 55% 42%)` }}
                  aria-hidden
                >
                  {address.slice(1, 3).toUpperCase()}
                </span>
                <span className="text-mono min-w-0 flex-1 truncate text-xs" title={address}>
                  {shortAddr(address, 10)}
                </span>
                <ReceiptPill receipt={receipt} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
