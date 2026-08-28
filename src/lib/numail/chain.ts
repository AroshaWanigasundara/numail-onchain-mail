/**
 * Real on-chain submission path for pallet-numail.
 *
 * When the connected node exposes `api.tx.numail` AND the user signs with a
 * real (non-demo) injected account, every action is submitted as a genuine
 * extrinsic. The local ledger is then updated as a read-model / cache so the
 * UI keeps rendering instantly. If either condition is missing we stay on the
 * local simulation.
 */
import type { Attachment, MailboxPolicy } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyApi = any;

export interface SubmitResult {
  txHash: string;
  blockHash: string | null;
  /** decoded `numail.*` events emitted by this extrinsic */
  events: { method: string; data: string[] }[];
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

export function encodeAttachments(attachments: Attachment[]) {
  return attachments.map((a) => ({ cid: a.cid, size: a.size, name: a.name }));
}

/** true when this node actually carries the pallet */
export function hasCall(api: AnyApi, method: string): boolean {
  return Boolean(api?.tx?.numail?.[method]);
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
 * Signs and submits `numail.<method>(...args)` with the injected signer for
 * `address`, resolving once the extrinsic is in a block.
 */
export async function submitExtrinsic(
  api: AnyApi,
  address: string,
  source: string,
  method: string,
  args: unknown[],
): Promise<SubmitResult> {
  if (!hasCall(api, method)) {
    throw new Error(`This node does not expose numail.${method}`);
  }
  const { web3FromSource } = await import("@polkadot/extension-dapp");
  const injector = await web3FromSource(source);
  const tx = api.tx.numail[method](...args);

  return await new Promise<SubmitResult>((resolve, reject) => {
    let unsub: (() => void) | undefined;
    tx.signAndSend(
      address,
      { signer: injector.signer },
      (result: AnyApi) => {
        const { status, dispatchError, events, txHash } = result;
        if (dispatchError) {
          unsub?.();
          reject(new Error(decodeDispatchError(api, dispatchError)));
          return;
        }
        if (status?.isInBlock || status?.isFinalized) {
          const blockHash = (status.isInBlock ? status.asInBlock : status.asFinalized).toString();
          const numailEvents = (events ?? [])
            .filter((e: AnyApi) => e.event?.section === "numail")
            .map((e: AnyApi) => ({
              method: String(e.event.method),
              data: e.event.data.map((d: AnyApi) => d.toString()),
            }));
          unsub?.();
          resolve({ txHash: txHash.toString(), blockHash, events: numailEvents });
        }
      },
    )
      .then((u: () => void) => {
        unsub = u;
      })
      .catch((e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
  });
}

/** Pulls a mail id out of the emitted MailSent event if present. */
export function mailIdFromEvents(result: SubmitResult): string | null {
  const sent = result.events.find((e) => /MailSent|MailQueued|MailDelivered/i.test(e.method));
  return sent?.data.find((d) => d.startsWith("0x")) ?? null;
}
