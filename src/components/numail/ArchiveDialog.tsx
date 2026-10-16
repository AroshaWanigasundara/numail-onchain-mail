import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, Loader2 } from "lucide-react";
import { useNumail } from "@/lib/numail/provider";
import { MAX_ARCHIVE_NAME, describeBlocks } from "@/lib/numail/archive";

const NEW = "__new__";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mailId: string | null;
  onArchived?: () => void;
}

export function ArchiveDialog({ open, onOpenChange, mailId, onArchived }: Props) {
  const { archives, ledger, account, actions, busy } = useNumail();
  const retention = account ? ledger.mailboxes[account.address]?.retention : undefined;
  const [choice, setChoice] = useState<string>(NEW);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChoice(archives[0]?.id ?? NEW);
    setName("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only (re)initialise when the dialog opens
  }, [open]);

  const creating = choice === NEW;
  const trimmed = name.trim();
  const nameTaken = creating && archives.some((a) => a.name.toLowerCase() === trimmed.toLowerCase());
  const invalid = creating && (!trimmed || trimmed.length > MAX_ARCHIVE_NAME || nameTaken);

  // NOTE: archiveMail is called straight from the click — the browser's file picker needs that gesture.
  const submit = async () => {
    if (!mailId) return;
    setError(null);
    try {
      await actions.archiveMail(mailId, creating ? { newName: trimmed } : { archiveId: choice });
      onArchived?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive mail</DialogTitle>
          <DialogDescription>
            The mail moves to your archive and a copy is saved to a <span className="text-mono">.pst</span> file on this
            computer. Its content is encrypted with your key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Archive folder</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger aria-label="Archive folder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {archives.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.items.length})
                  </SelectItem>
                ))}
                <SelectItem value={NEW}>New archive folder…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {creating && (
            <div className="space-y-2">
              <Label htmlFor="archive-name">Folder name</Label>
              <Input
                id="archive-name"
                value={name}
                maxLength={MAX_ARCHIVE_NAME}
                placeholder="e.g. Projects 2026"
                onChange={(e) => setName(e.target.value)}
              />
              {nameTaken && <p className="text-xs text-destructive">An archive folder with that name already exists.</p>}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {retention
              ? `You can restore this mail for about ${describeBlocks(retention)} (${retention} blocks) after archiving. After that it stays in the archive.`
              : "No retention window is set on your mailbox, so this mail can be restored at any time."}
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
          <Button onClick={submit} disabled={busy !== null || invalid}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Archive
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
