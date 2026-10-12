/**
 * Real on-chain submission path for pallet-numail.
 *
 * The runtime pallet is registered as `NuMail` (pallet index 8), which
 * polkadot-js exposes camelCased as `api.tx.nuMail` / `api.events.nuMail`.
 * Calls (from the v15 metadata of the dev chain):
 *
 *   createMailbox(policy: AcceptancePolicy, retentionBlocks: Option<u32>, folders: Vec<Bytes>)
 *   sendMail(recipients: Vec<AccountId32>, subjectHash: H256, encryptedBody: Bytes,
 *            encryptedKeys: Vec<(AccountId32, Bytes)>, attachments: Vec<H256>,
 *            threadParent: Option<u64>)
 *   // encryptedBody = AES-256-GCM(nonce ‖ ciphertext ‖ tag); encryptedKeys wrap
 *   // the AES key with each recipient's registered RSA-4096 public key.
 *   markRead(mailId: u64)
 *   tombstone(mailId: u64)
 *   moveToFolder(mailId: u64, folder: Bytes)
 *   setMailboxPolicy(policy: AcceptancePolicy, retentionBlocks: Option<u32>)
 *   blockSender(blocked: AccountId32)
 *   unblockSender(unblocked: AccountId32)
 *
 * AcceptancePolicy = Open | ContactsOnly | MinTrustScore(u32) | PostageRequired(Balance)
 *
 * When the connected node exposes the pallet AND the user signs with a real
 * (non-demo) account, every action is submitted as a genuine extrinsic and the
 * local ledger is mirrored as a read-model. Otherwise we stay on simulation.
 */
import type { Attachment, MailboxPolicy } from "./types";
import { shortHash } from "./ledger";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyApi = any;

export interface SubmitResult {
  txHash: string;
  blockHash: string | null;
  /** decoded `nuMail.*` events emitted by this extrinsic */
  events: { method: string; data: string[] }[];
}

/** The pallet tx section, tolerating older `numail` naming. */
function palletTx(api: AnyApi): AnyApi {
  return api?.tx?.nuMail ?? api?.tx?.numail ?? null;
}

export function encodePolicy(policy: MailboxPolicy): Record<string, unknown> {
  switch (policy.kind) {
    case "MinTrustScore":
      return { MinTrustScore: policy.minTrustScore ?? 0 };
    case "PostageRequired":
      return { PostageRequired: policy.postage ?? 0 };
    case "ContactsOnly":
      return { ContactsOnly: null };
    default:
      return { Open: null };
  }
}

/**
 * Deterministic 32-byte content hash for H256 args (subject_hash, body_ref,
 * attachment hashes). The ledger's shortHash is only 8 bytes, which the
 * runtime rejects — expand it to a full H256 here.
 */
export function contentHash(input: string): string {
  let out = "";
  for (let i = 0; out.length < 64; i++) out += shortHash(`${i}:${input}`).slice(2);
  return `0x${out.slice(0, 64)}`;
}

/** The pallet takes `Vec<H256>` attachment hashes — hash each attachment ref. */
export function encodeAttachments(attachments: Attachment[]): string[] {
  return attachments.map((a) => contentHash(a.cid || a.name));
}

/** true when this node actually carries the pallet */
export function hasPallet(api: AnyApi): boolean {
  return Boolean(palletTx(api));
}

/** true when this node actually exposes `nuMail.<method>` */
export function hasCall(api: AnyApi, method: string): boolean {
  return Boolean(palletTx(api)?.[method]);
}

/** Extracts a human error out of a DispatchError. */
function decodeDispatchError(api: AnyApi, dispatchError: AnyApi): string {
  if (dispatchError?.isModule) {
    try {
      const decoded = api.registry.findMetaError(dispatchError.asModule);
      return `${decoded.section}.${decoded.name}`;
    } catch {
      return dispatchError.toString();
    }
  }
  return dispatchError?.toString?.() ?? "Extrinsic failed";
}

/**
 * Signs and submits `nuMail.<method>(...args)` with the injected signer for
 * `address`, resolving once the extrinsic is in a block.
 */
export async function submitExtrinsic(
  api: AnyApi,
  address: string,
  source: string,
  method: string,
  args: unknown[],
  devName?: string,
): Promise<SubmitResult> {
  if (!hasCall(api, method)) {
    throw new Error(`This node does not expose nuMail.${method}`);
  }
  const tx = palletTx(api)[method](...args);
  return signAndSubmitTx(api, tx, address, source, devName);
}

/** Signs and submits an already-built extrinsic, resolving once it is in a block. */
export async function signAndSubmitTx(
  api: AnyApi,
  tx: AnyApi,
  address: string,
  source: string,
  devName?: string,
): Promise<SubmitResult> {
  let pair: import("@polkadot/keyring/types").KeyringPair | null = null;
  let extensionSigner: unknown = null;
  if (source === "dev" && devName) {
    const { devPair } = await import("./devAccounts");
    pair = await devPair(devName);
  } else {
    const { web3FromSource } = await import("@polkadot/extension-dapp");
    const injector = await web3FromSource(source);
    extensionSigner = injector.signer;
  }

  return await new Promise<SubmitResult>((resolve, reject) => {
    let unsub: (() => void) | undefined;
    const onStatus = (result: AnyApi) => {
      const { status, dispatchError, events, txHash } = result;
      if (dispatchError) {
        unsub?.();
        reject(new Error(decodeDispatchError(api, dispatchError)));
        return;
      }
      if (status?.isInBlock || status?.isFinalized) {
        // sudo.sudo(...) reports the INNER call's outcome in a Sudid event,
        // not as a dispatchError on the outer extrinsic.
        const sudid = (events ?? []).find(
          (e: AnyApi) => e.event?.section === "sudo" && e.event?.method === "Sudid",
        );
        const inner = sudid?.event?.data?.[0];
        if (inner?.isErr) {
          unsub?.();
          reject(new Error(decodeDispatchError(api, inner.asErr)));
          return;
        }
        const blockHash = (status.isInBlock ? status.asInBlock : status.asFinalized).toString();
        const numailEvents = (events ?? [])
          .filter((e: AnyApi) => /^numail$/i.test(String(e.event?.section)))
          .map((e: AnyApi) => ({
            method: String(e.event.method),
            data: e.event.data.map((d: AnyApi) => d.toString()),
          }));
        unsub?.();
        resolve({ txHash: txHash.toString(), blockHash, events: numailEvents });
      }
    };
    const sendPromise: Promise<() => void> = pair
      ? tx.signAndSend(pair, onStatus)
      : tx.signAndSend(address, { signer: extensionSigner }, onStatus);
    sendPromise
      .then((u: () => void) => {
        unsub = u;
      })
      .catch((e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
  });
}

/**
 * system_notice needs Root, so it is wrapped in sudo.sudo(...) and signed by
 * the chain's sudo key. That key is matched against the built-in dev accounts
 * (Alice on your dev genesis); failing that, the connected account is used
 * if it happens to be the sudo key.
 */
export async function submitSystemNotice(
  api: AnyApi,
  args: unknown[],
  current?: { address: string; source: string; devName?: string | undefined },
): Promise<SubmitResult> {
  if (!hasCall(api, "systemNotice")) throw new Error("This node does not expose nuMail.systemNotice");
  if (!api?.tx?.sudo?.sudo || !api?.query?.sudo?.key) throw new Error("This runtime has no sudo pallet");

  const opt = await api.query.sudo.key();
  const sudoKey = typeof opt?.isSome === "boolean" ? (opt.isSome ? opt.unwrap() : null) : opt;
  if (!sudoKey) throw new Error("This chain has no sudo key set");

  const { u8aEq } = await import("@polkadot/util");
  const { DEV_ACCOUNT_NAMES, devPair } = await import("./devAccounts");
  let signer: { address: string; source: string; devName?: string } | null = null;
  for (const name of DEV_ACCOUNT_NAMES) {
    const pair = await devPair(name);
    if (u8aEq(pair.publicKey, sudoKey.toU8a())) {
      signer = { address: pair.address, source: "dev", devName: name };
      break;
    }
  }
  if (!signer && current && u8aEq(api.createType("AccountId", current.address).toU8a(), sudoKey.toU8a())) {
    signer = { address: current.address, source: current.source, ...(current.devName ? { devName: current.devName } : {}) };
  }
  if (!signer) {
    throw new Error(`system_notice must be signed by the sudo account (${sudoKey.toString()}), which is not a built-in dev account.`);
  }

  const tx = api.tx.sudo.sudo(palletTx(api).systemNotice(...args));
  return signAndSubmitTx(api, tx, signer.address, signer.source, signer.devName);
}

/**
 * Pulls the mail id out of the emitted `MailSent(mail_id, sender, count)`
 * event. MailId is a u64 on this runtime, so it is the first numeric field.
 */
export function mailIdFromEvents(result: SubmitResult): string | null {
  const sent = result.events.find((e) => /MailSent/i.test(e.method));
  const id = sent?.data[0];
  return id ?? null;
}
