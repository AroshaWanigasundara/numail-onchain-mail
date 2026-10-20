import { useMemo, useState } from "react";
import { Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNumail } from "@/lib/numail/provider";
import { resolveName, type NameContext } from "@/lib/numail/names";
import { AddressAvatar } from "./AddressAvatar";

/** Name resolution for the current account: your nickname > on-chain name > short address. */
export function useNames() {
  const { account, contacts, directory } = useNumail();
  const me = account?.address;
  return useMemo(() => {
    const ctx: NameContext = { me, contacts, directory };
    const resolve = (address: string, selfAs: "you" | "name" = "you") => resolveName(address, ctx, selfAs);
    /** a name to build avatar initials from; undefined when the address has no name */
    const named = (address: string) => {
      const r = resolveName(address, ctx, "name");
      return r.source === "address" ? undefined : r.label;
    };
    return { ctx, resolve, named };
  }, [me, contacts, directory]);
}

const SOURCE_TEXT = {
  you: "This is you",
  nickname: "Your nickname",
  directory: "On-chain name",
  address: "No name published",
} as const;

/** Outlook-style contact card. */
export function ContactCard({ address, onClose }: { address: string; onClose?: () => void }) {
  const { resolve, ctx } = useNames();
  const { actions } = useNumail();
  const r = resolve(address, "name");
  const mine = address === ctx.me;
  const chainName = ctx.directory[address];
  const [nick, setNick] = useState(ctx.contacts[address] ?? "");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <AddressAvatar address={address} name={r.source === "address" ? undefined : r.label} className="h-12 w-12 text-sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{mine && r.source === "address" ? "You" : r.label}</p>
          <Badge variant="outline" className="mt-0.5 text-[10px]">
            {mine ? SOURCE_TEXT.you : SOURCE_TEXT[r.source]}
          </Badge>
        </div>
      </div>

      {chainName && r.source === "nickname" && (
        <p className="text-xs text-muted-foreground">
          On-chain name: <span className="font-medium text-foreground">{chainName}</span>
        </p>
      )}

      <div>
        <p className="text-[11px] text-muted-foreground">Wallet address</p>
        <div className="mt-1 flex items-start gap-2">
          <p className="text-mono min-w-0 flex-1 text-xs break-all">{address}</p>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            aria-label="Copy address"
            onClick={() => {
              void navigator.clipboard.writeText(address);
              toast.success("Address copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!mine && (
        <>
          <div>
            <p className="text-[11px] text-muted-foreground">Your nickname (private, only on this device)</p>
            <div className="mt-1 flex gap-2">
              <Input value={nick} maxLength={40} placeholder="e.g. Mum, Accountant" onChange={(e) => setNick(e.target.value)} />
              <Button type="button" variant="secondary" onClick={() => actions.setContact(address, nick)}>
                Save
              </Button>
            </div>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("numail:compose", { detail: { to: [address] } }));
              onClose?.();
            }}
          >
            <Send className="h-4 w-4" />
            Send mail
          </Button>
        </>
      )}
    </div>
  );
}

/** A clickable name; opens the contact card. Do not nest inside another button. */
export function AddressName({
  address,
  selfAs = "you",
  className = "",
}: {
  address: string;
  selfAs?: "you" | "name";
  className?: string;
}) {
  const { resolve } = useNames();
  const [open, setOpen] = useState(false);
  const r = resolve(address, selfAs);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={address}
          className={`max-w-full truncate rounded-sm text-left underline-offset-2 hover:underline focus-visible:underline ${className}`}
        >
          {r.label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <ContactCard address={address} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
