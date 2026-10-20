import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { buildPeople, isAddressLike, searchPeople } from "@/lib/numail/names";
import { AddressAvatar } from "./AddressAvatar";
import { useNames } from "./AddressName";
import { shortAddr } from "./shared";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** other known addresses (e.g. mailboxes seen on chain) to offer as suggestions */
  extra: string[];
  max: number;
  onError: (message: string | null) => void;
}

const TAG = { you: "You", nickname: "Contact", directory: "On-chain name", address: "Mailbox" } as const;

export function RecipientPicker({ value, onChange, extra, max, onError }: Props) {
  const { ctx, resolve, named } = useNames();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const people = useMemo(() => buildPeople(ctx, extra), [ctx, extra]);
  const matches = useMemo(
    () => searchPeople(people, text, new Set([...(ctx.me ? [ctx.me] : []), ...value])),
    [people, text, ctx.me, value],
  );

  const add = (address: string) => {
    if (value.includes(address)) {
      setText("");
      return;
    }
    if (value.length >= max) return onError(`A single mail may carry at most ${max} recipients.`);
    onChange([...value, address]);
    setText("");
    setActive(0);
    onError(null);
  };

  const commit = () => {
    const pick = open ? matches[active] : undefined;
    if (pick) return add(pick.address);
    const t = text.trim();
    if (isAddressLike(t)) return add(t);
    if (matches.length === 1) return add(matches[0]!.address);
    if (t) onError("Pick a name from the list, or paste a full wallet address.");
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((r) => (
            <Badge key={r} variant="secondary" className="gap-1.5 py-0.5 pr-1 pl-1 text-xs" title={r}>
              <AddressAvatar address={r} name={named(r)} className="h-5 w-5 text-[9px]" />
              {resolve(r).label}
              <button
                type="button"
                aria-label={`Remove ${resolve(r).label}`}
                onClick={() => onChange(value.filter((y) => y !== r))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          id="recipients"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls="recipient-options"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder="Type a name or paste a wallet address"
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
            onError(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && !text && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
        />

        {open && matches.length > 0 && (
          <ul
            id="recipient-options"
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
          >
            {matches.map((p, i) => (
              <li
                key={p.address}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(p.address)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 ${i === active ? "bg-accent" : ""}`}
              >
                <AddressAvatar address={p.address} name={p.source === "address" ? undefined : p.label} className="h-8 w-8 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.label}</p>
                  <p className="text-mono truncate text-[10px] text-muted-foreground">
                    {p.nickname && p.chainName ? `${p.chainName} · ` : ""}
                    {shortAddr(p.address, 10)}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{TAG[p.source]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
