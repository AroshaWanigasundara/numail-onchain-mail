import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useNumail } from "@/lib/numail/provider";
import {
  KeyImportError,
  MIN_BACKUP_PASSPHRASE,
  exportKeyBackup,
  importKeyBackup,
  importPrivateKeyPem,
  isKeyBackup,
  type NumailKeyPair,
} from "@/lib/numail/keys";
import { shortAddr } from "./shared";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ------------------------------ export ------------------------------ */

export function ExportKeyDialog({
  open,
  onOpenChange,
  address,
  pair,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: string;
  pair: NumailKeyPair;
}) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPass("");
      setConfirm("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    if (pass.length < MIN_BACKUP_PASSPHRASE) return setError(`Use at least ${MIN_BACKUP_PASSPHRASE} characters.`);
    if (pass !== confirm) return setError("The two passphrases don't match.");
    setBusy(true);
    try {
      const text = await exportKeyBackup(address, pair, pass);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `numail-key-backup-${address.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Encrypted key backup downloaded");
      onOpenChange(false);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export encrypted key backup</DialogTitle>
          <DialogDescription>
            Your private key is encrypted with a passphrase you choose. Use the file and passphrase on another device to
            read the same mailbox.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bk-pass">Passphrase</Label>
            <Input id="bk-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-confirm">Confirm passphrase</Label>
            <Input id="bk-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Nobody can recover this passphrase. If you lose both the passphrase and every copy of your key, mail sent to
            you can never be decrypted. Store the file and the passphrase in different places.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !pass || !confirm}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download backup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ import ------------------------------ */

export function ImportKeyDialog({
  open,
  onOpenChange,
  address,
  hasKey,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: string;
  /** a key already exists on this device */
  hasKey: boolean;
  onImported: () => void;
}) {
  const { actions } = useNumail();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [pass, setPass] = useState("");
  const [replaceOk, setReplaceOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText("");
      setFileName("");
      setPass("");
      setReplaceOk(false);
      setError(null);
    }
  }, [open]);

  const encrypted = isKeyBackup(text);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      let pair: NumailKeyPair;
      if (encrypted) {
        const r = await importKeyBackup(text, pass);
        if (r.address !== address) {
          throw new KeyImportError(`This backup belongs to a different account (${shortAddr(r.address, 6)}).`);
        }
        pair = r.pair;
      } else {
        pair = await importPrivateKeyPem(text);
      }
      await actions.importKey(pair);
      onImported();
      onOpenChange(false);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import private key</DialogTitle>
          <DialogDescription>
            Choose your NuMail key backup (.json) or a private key PEM downloaded earlier. The key is checked against the
            public key registered on chain for this account before it is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="key-file">Key file</Label>
            <Input
              id="key-file"
              type="file"
              accept=".json,.pem,.txt,application/json,text/plain"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setError(null);
                setFileName(f.name);
                setText(await f.text());
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-text">…or paste it</Label>
            <textarea
              id="key-text"
              spellCheck={false}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName("");
              }}
              placeholder="-----BEGIN PRIVATE KEY----- …"
              className="text-mono h-24 w-full resize-none rounded-md border border-border bg-muted/40 p-2 text-xs"
            />
          </div>

          {text.trim() && (
            <p className="text-xs text-muted-foreground">
              {encrypted ? "Encrypted NuMail backup detected" : "Private key PEM detected"}
              {fileName ? ` (${fileName})` : ""}.
            </p>
          )}

          {encrypted && (
            <div className="space-y-1.5">
              <Label htmlFor="imp-pass">Backup passphrase</Label>
              <Input id="imp-pass" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
            </div>
          )}

          {hasKey && (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={replaceOk} onChange={(e) => setReplaceOk(e.target.checked)} />
              <span>This device already has a key for this account. Importing replaces it.</span>
            </label>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !text.trim() || (encrypted && !pass) || (hasKey && !replaceOk)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
