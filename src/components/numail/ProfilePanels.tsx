import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNumail } from "@/lib/numail/provider";
import { CONSTANTS } from "@/lib/numail/types";
import { isAddressLike, validateDisplayName } from "@/lib/numail/names";
import { AddressAvatar } from "./AddressAvatar";
import { shortAddr } from "./shared";

/** Publish the name other people see instead of your wallet address. */
export function DisplayNamePanel() {
  const { account, ledger, directory, actions, busy } = useNumail();
  const address = account?.address;
  const mailbox = address ? ledger.mailboxes[address] : undefined;
  const current = address ? directory[address] : undefined;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // start from the published name, or suggest the wallet's own name
  useEffect(() => setName(current ?? account?.name ?? ""), [current, account?.name]);

  const invalid = name.trim() ? validateDisplayName(name) : null;
  const unchanged = name.trim() === (current ?? "");

  const save = async () => {
    setError(null);
    try {
      await actions.setDisplayName(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="surface-panel space-y-3 p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Display name</h2>
      <p className="text-sm text-muted-foreground">
        People see this name instead of your wallet address, and can find you by typing it when they write a mail. It is
        public on chain and unique.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="display-name">Name</Label>
        <div className="flex gap-2">
          <Input
            id="display-name"
            value={name}
            maxLength={CONSTANTS.MaxDisplayNameBytes}
            placeholder="e.g. Alice Perera"
            disabled={!mailbox}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={save} disabled={!mailbox || busy !== null || !name.trim() || Boolean(invalid) || unchanged}>
            {busy === "setDisplayName" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          {current && (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void actions.clearDisplayName().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
            >
              Remove
            </Button>
          )}
        </div>
        {invalid && <p className="text-xs text-destructive">{invalid}</p>}
        {!mailbox && <p className="text-xs text-muted-foreground">Create your mailbox first to publish a name.</p>}
        {!current && account?.name && name === account.name && (
          <p className="text-xs text-muted-foreground">Suggested from your wallet name.</p>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Private nicknames, kept only in this browser. They override the public names. */
export function ContactsPanel() {
  const { contacts, directory, actions } = useNumail();
  const [address, setAddress] = useState("");
  const [nick, setNick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entries = useMemo(() => Object.entries(contacts).sort((a, b) => a[1].localeCompare(b[1])), [contacts]);
  const published = Object.keys(directory).length;

  return (
    <div className="surface-panel space-y-3 p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Contacts</h2>
      <p className="text-sm text-muted-foreground">
        Private nicknames stored only on this device. {published} {published === 1 ? "person has" : "people have"}{" "}
        published a name on chain. You can also set a nickname by clicking any name in your mail.
      </p>

      {entries.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map(([addr, n]) => (
            <li key={addr} className="flex items-center gap-3 px-3 py-2">
              <AddressAvatar address={addr} name={n} className="h-8 w-8 text-[10px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{n}</p>
                <p className="text-mono truncate text-[10px] text-muted-foreground">
                  {directory[addr] ? `${directory[addr]} · ` : ""}
                  {shortAddr(addr, 10)}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Remove ${n}`} onClick={() => actions.setContact(addr, "")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <Input value={address} placeholder="Wallet address" spellCheck={false} className="text-mono text-sm" onChange={(e) => setAddress(e.target.value)} />
        <Input value={nick} placeholder="Nickname" maxLength={40} onChange={(e) => setNick(e.target.value)} />
        <Button
          variant="secondary"
          onClick={() => {
            if (!isAddressLike(address.trim())) return setError("Enter a full wallet address.");
            if (!nick.trim()) return setError("Enter a nickname.");
            actions.setContact(address.trim(), nick);
            setAddress("");
            setNick("");
            setError(null);
          }}
        >
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
