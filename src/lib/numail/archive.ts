/**
 * Outlook-style archive folders — frontend only, no pallet changes.
 *
 * - Archive folders are named containers kept in localStorage (per account)
 *   and mirrored to a `.pst` file on the user's computer.
 * - The `.pst` is a NuMail container (NOT Outlook's binary format): metadata in
 *   clear, subject/body encrypted to the owner's public key.
 * - Retention is enforced here, in the UI: restore is allowed until
 *   archivedAtBlock + retentionBlocks (no retention window = no deadline).
 */
import { CONSTANTS, type MailEnvelope } from "./types";
import { decryptMailWithKey, encryptMailForRecipients } from "./keys";

export const ARCHIVE_PREFIX = "archive:";
export const MAX_ARCHIVE_NAME = 64;
const PST_EXT = ".pst";
const PST_FORMAT = "numail-pst";
const PST_VERSION = 1;
const STORAGE_PREFIX = "numail_archives_v1:";

export interface ArchivedItem {
  mailId: string;
  envelope: MailEnvelope;
  subject: string;
  body: string;
  originFolder: string;
  archivedAtBlock: number;
  archivedAt: number;
  /** retention window (blocks) in force when archived; undefined = never expires */
  retentionBlocks?: number | undefined;
}

export interface ArchiveFolder {
  id: string;
  name: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  items: ArchivedItem[];
}

export function newArchiveId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- retention -------------------------------------------------------------

/** Last block at which the mail can still be restored; null = no deadline. */
export function restoreDeadline(item: ArchivedItem): number | null {
  return item.retentionBlocks == null ? null : item.archivedAtBlock + item.retentionBlocks;
}

export function canRestore(item: ArchivedItem, headBlock: number): boolean {
  const deadline = restoreDeadline(item);
  return deadline === null || headBlock <= deadline;
}

export function describeBlocks(blocks: number): string {
  const s = Math.max(0, blocks) * CONSTANTS.BlockTimeSeconds;
  if (s >= 86_400) return `${Math.round(s / 86_400)} day(s)`;
  if (s >= 3_600) return `${Math.round(s / 3_600)} hour(s)`;
  return `${Math.max(1, Math.round(s / 60))} minute(s)`;
}

// ---- browser cache ---------------------------------------------------------

export function loadArchives(address: string): ArchiveFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + address);
    return raw ? (JSON.parse(raw) as ArchiveFolder[]) : [];
  } catch {
    return [];
  }
}

/** Returns false when the browser refused the write (e.g. quota exceeded). */
export function saveArchives(address: string, folders: ArchiveFolder[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + address, JSON.stringify(folders));
    return true;
  } catch (e) {
    console.error("[numail] could not cache archives", e);
    return false;
  }
}

// ---- .pst container --------------------------------------------------------

type PstItemFile = Omit<ArchivedItem, "subject" | "body"> & {
  enc: { subject: string; body: string; key: string };
};

interface PstFile {
  format: string;
  version: number;
  owner: string;
  folder: { id: string; name: string; createdAt: number };
  savedAt: number;
  items: PstItemFile[];
}

export class PstError extends Error {}

export async function buildPst(folder: ArchiveFolder, ownerPublicKeyHex: string): Promise<Blob> {
  const items: PstItemFile[] = [];
  for (const { subject, body, ...meta } of folder.items) {
    const c = await encryptMailForRecipients(subject, body, [ownerPublicKeyHex]);
    items.push({
      ...meta,
      enc: { subject: c.encryptedSubjectB64, body: c.encryptedBodyB64, key: c.encryptedKeysHex[0] ?? "" },
    });
  }
  const file: PstFile = {
    format: PST_FORMAT,
    version: PST_VERSION,
    owner: folder.owner,
    folder: { id: folder.id, name: folder.name, createdAt: folder.createdAt },
    savedAt: Date.now(),
    items,
  };
  return new Blob([JSON.stringify(file)], { type: "application/octet-stream" });
}

export async function readPst(
  text: string,
  owner: string,
  privateKeyBase64: string,
): Promise<{ folder: ArchiveFolder; skipped: number }> {
  let file: PstFile;
  try {
    file = JSON.parse(text) as PstFile;
  } catch {
    throw new PstError("This is not a NuMail .pst file.");
  }
  if (file?.format !== PST_FORMAT || !Array.isArray(file.items) || !file.folder?.id) {
    throw new PstError("This is not a NuMail .pst file.");
  }
  if (file.version > PST_VERSION) throw new PstError("This .pst was created by a newer version of NuMail.");
  if (file.owner !== owner) throw new PstError("This .pst file belongs to a different account.");

  const items: ArchivedItem[] = [];
  let skipped = 0;
  for (const raw of file.items) {
    try {
      const { enc, ...meta } = raw;
      const { subject, body } = await decryptMailWithKey(enc.subject, enc.body, enc.key, privateKeyBase64);
      items.push({ ...meta, subject, body });
    } catch {
      skipped += 1;
    }
  }
  if (file.items.length > 0 && items.length === 0) {
    throw new PstError("None of the mail could be decrypted. Is this device using the key that created the archive?");
  }
  return {
    folder: {
      id: file.folder.id,
      name: file.folder.name,
      owner,
      createdAt: file.folder.createdAt,
      updatedAt: file.savedAt,
      items,
    },
    skipped,
  };
}

// ---- writing the file to the user's computer -------------------------------

export interface PstSink {
  fileName: string;
  write(blob: Blob): Promise<void>;
}

/** Session-only: archive id -> where its .pst is written. */
const sinks = new Map<string, PstSink>();

export const hasPstSink = (id: string) => sinks.has(id);
export const dropPstSink = (id: string) => void sinks.delete(id);

const safeFileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "archive"}${PST_EXT}`;

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface WritableHandle {
  name?: string;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

/**
 * Chrome/Edge: asks once where to save, then overwrites that file.
 * Other browsers: falls back to a download each time.
 * Returns null when the user cancels the picker. MUST be called straight from
 * a click handler (the picker needs the user gesture).
 */
export async function acquirePstSink(id: string, name: string): Promise<PstSink | null> {
  const existing = sinks.get(id);
  if (existing) return existing;

  const fileName = safeFileName(name);
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<WritableHandle> })
    .showSaveFilePicker;

  let sink: PstSink;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: fileName,
        types: [{ description: "NuMail archive", accept: { "application/octet-stream": [PST_EXT] } }],
      });
      sink = {
        fileName: handle.name ?? fileName,
        write: async (blob) => {
          const w = await handle.createWritable();
          await w.write(blob);
          await w.close();
        },
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      throw e;
    }
  } else {
    sink = { fileName, write: async (blob) => downloadBlob(blob, fileName) };
  }
  sinks.set(id, sink);
  return sink;
}
