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

/* ------------------------------------------------------------------ */
/* Hybrid encryption (AES-256-GCM body + RSA-OAEP wrapped AES key)      */
/* ------------------------------------------------------------------ */

function subtleOrThrow(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Encryption is unavailable in this browser context");
  return subtle;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const pairs = clean.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((p) => Number.parseInt(p, 16)));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

export interface HybridCiphertext {
  /** 0x-prefixed: 12-byte nonce ‖ ciphertext ‖ 16-byte GCM tag */
  encryptedBodyHex: string;
  /** one 0x-prefixed RSA-OAEP wrapped AES key per recipient, same order */
  encryptedKeysHex: string[];
}

/**
 * 1) random AES-256 key, 2) AES-256-GCM over the body (nonce ‖ ct ‖ tag),
 * 3) the AES key wrapped with each recipient's RSA-4096 public key (SPKI).
 */
export async function encryptBodyForRecipients(
  body: string,
  recipientPublicKeysHex: string[],
): Promise<HybridCiphertext> {
  const subtle = subtleOrThrow();
  const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, new TextEncoder().encode(body)),
  );
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  const rawAesKey = new Uint8Array(await subtle.exportKey("raw", aesKey));
  const encryptedKeysHex: string[] = [];
  for (const pubHex of recipientPublicKeysHex) {
    const pub = await subtle.importKey(
      "spki",
      bufferSource(hexToBytes(pubHex)),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
    const wrapped = new Uint8Array(await subtle.encrypt({ name: "RSA-OAEP" }, pub, bufferSource(rawAesKey)));
    encryptedKeysHex.push(`0x${bytesToHex(wrapped)}`);
  }

  return { encryptedBodyHex: `0x${bytesToHex(combined)}`, encryptedKeysHex };
}

/** Recipient-side: unwrap the AES key with the private key, then decrypt the body. */
export async function decryptBodyWithKey(
  encryptedBodyHex: string,
  encryptedKeyHex: string,
  privateKeyBase64: string,
): Promise<string> {
  const subtle = subtleOrThrow();
  const priv = await subtle.importKey(
    "pkcs8",
    bufferSource(fromBase64(privateKeyBase64)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const rawAesKey = await subtle.decrypt({ name: "RSA-OAEP" }, priv, bufferSource(hexToBytes(encryptedKeyHex)));
  const aesKey = await subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const all = hexToBytes(encryptedBodyHex);
  const nonce = all.slice(0, 12);
  const payload = all.slice(12);
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    bufferSource(payload),
  );
  return new TextDecoder().decode(plain);
}
