/**
 * Real on-chain submission path for pallet-numail.
 *
 * The runtime pallet is registered as `NuMail` (pallet index 8), which
 * polkadot-js exposes camelCased as `api.tx.nuMail` / `api.events.nuMail`.
 * Calls (from the v15 metadata of the dev chain):
 *
 *   createMailbox(policy: AcceptancePolicy, retentionBlocks: Option<u32>, folders: Vec<Bytes>)
 *   sendMail(recipients: Vec<AccountId32>, subjectHash: H256, bodyRef: H256,
 *            attachments: Vec<H256>, threadParent: Option<u64>)
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

/** The pallet takes `Vec<H256>` attachment hashes — hash each attachment ref. */
export function encodeAttachments(attachments: Attachment[]): string[] {
  return attachments.map((a) => shortHash(a.cid || a.name));
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
  /** when set, sign with the in-browser dev keypair (//Alice etc.) instead of an extension */
  devName?: string,
): Promise<SubmitResult> {
  if (!hasCall(api, method)) {
    throw new Error(`This node does not expose nuMail.${method}`);
  }
  const tx = palletTx(api)[method](...args);

  // Dev accounts (//Alice, //Bob, …) sign directly with a keypair — no extension.
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
 * Pulls the mail id out of the emitted `MailSent(mail_id, sender, count)`
 * event. MailId is a u64 on this runtime, so it is the first numeric field.
 */
export function mailIdFromEvents(result: SubmitResult): string | null {
  const sent = result.events.find((e) => /MailSent/i.test(e.method));
  const id = sent?.data[0];
  return id ?? null;
}
