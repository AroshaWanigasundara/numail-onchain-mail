/**
 * Client-side RSA-4096 identity keys for NuMail.
 *
 * The public key (SPKI/DER) is registered on chain as the `public_key`
 * argument of `nuMail.create_mailbox`. The private key (PKCS#8) never leaves
 * the browser — it is stored in localStorage so the user can view, copy or
 * back it up from Settings.
 */

const PRIV_KEY = "numail_private_key";
const PUB_KEY = "numail_public_key";

export interface NumailKeyPair {
  /** PKCS#8 private key, base64 (DER) */
  privateKeyBase64: string;
  /** SPKI public key, hex without 0x */
  publicKeyHex: string;
  createdAt: number;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pem(label: string, base64: string): string {
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

/** Generate a fresh RSA-4096 (RSA-OAEP / SHA-256) keypair in the browser. */
export async function generateRSA4096KeyPair(): Promise<NumailKeyPair> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Secure key generation is unavailable in this browser context");
  const keyPair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const spki = await subtle.exportKey("spki", keyPair.publicKey);
  const pkcs8 = await subtle.exportKey("pkcs8", keyPair.privateKey);
  return { publicKeyHex: toHex(spki), privateKeyBase64: toBase64(pkcs8), createdAt: Date.now() };
}

function storageKeys(address: string) {
  return { priv: `${PRIV_KEY}:${address}`, pub: `${PUB_KEY}:${address}` };
}

export function saveKeyPair(address: string, pair: NumailKeyPair) {
  if (typeof window === "undefined") return;
  const k = storageKeys(address);
  window.localStorage.setItem(k.priv, JSON.stringify(pair));
  window.localStorage.setItem(k.pub, pair.publicKeyHex);
  // mirror the active key under the plain names for convenience
  window.localStorage.setItem(PRIV_KEY, pair.privateKeyBase64);
  window.localStorage.setItem(PUB_KEY, pair.publicKeyHex);
}

export function loadKeyPair(address: string): NumailKeyPair | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKeys(address).priv);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NumailKeyPair;
    return parsed.privateKeyBase64 && parsed.publicKeyHex ? parsed : null;
  } catch {
    return null;
  }
}

/** Existing key for this account, or a newly generated and stored one. */
export async function ensureKeyPair(address: string): Promise<NumailKeyPair> {
  const existing = loadKeyPair(address);
  if (existing) return existing;
  const fresh = await generateRSA4096KeyPair();
  saveKeyPair(address, fresh);
  return fresh;
}

export function privateKeyPem(pair: NumailKeyPair): string {
  return pem("PRIVATE KEY", pair.privateKeyBase64);
}

export function publicKeyPem(pair: NumailKeyPair): string {
  const bytes = pair.publicKeyHex.match(/.{1,2}/g) ?? [];
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(Number.parseInt(b, 16));
  return pem("PUBLIC KEY", btoa(bin));
}
