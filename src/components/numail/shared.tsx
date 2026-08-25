import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import type { DeliveryStatus, MailboxPolicy } from "@/lib/numail/types";

export function shortAddr(address: string, size = 6) {
  if (address.length <= size * 2 + 3) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function policyLabel(p: MailboxPolicy) {
  switch (p.kind) {
    case "MinTrustScore":
      return `Min trust score ${p.minTrustScore ?? 0}`;
    case "PostageRequired":
      return `Postage ≥ ${p.postage ?? 0}`;
    case "ContactsOnly":
      return "Contacts only";
    default:
      return "Open";
  }
}

const statusStyles: Record<DeliveryStatus, string> = {
  Delivered: "border-info/40 bg-info/10 text-info",
  Read: "border-border bg-muted text-muted-foreground",
  Archived: "border-warning/40 bg-warning/15 text-warning-foreground",
  Tombstoned: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Badge variant="outline" className={`text-[11px] font-medium ${statusStyles[status]}`}>
      {status}
    </Badge>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="More information" className="text-muted-foreground hover:text-foreground">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}

export const GLOSSARY = {
  tombstone:
    "Tombstoning marks the mail as permanently removed for your account. The envelope stays on chain but is no longer served to you.",
  policy:
    "Your acceptance policy decides who may deliver mail to you: anyone (Open), prior correspondents (Contacts only), accounts above a trust score, or senders who attach postage.",
  postage:
    "Postage is a refundable deposit a sender attaches. It is released back once you mark the mail as read.",
  retention:
    "Retention window is the number of blocks the chain keeps your mail envelopes before they may be pruned.",
  anchored:
    "Attachments must first be anchored on DNC (Module 2). NuMail stores only the anchor reference, never the file bytes.",
} as const;
