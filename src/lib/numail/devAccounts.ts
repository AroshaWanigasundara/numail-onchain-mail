/**
 * Substrate development accounts (Alice, Bob, …).
 *
 * These are the well-known `//Alice` style keyring accounts that every dev
 * chain funds at genesis. They sign directly in the browser via
 * @polkadot/keyring — no extension needed — so they can submit REAL
 * extrinsics while testing. Never use them on a live network.
 *
 * Imports are dynamic so nothing Polkadot-related is evaluated during SSR.
 */
import type { KeyringPair } from "@polkadot/keyring/types";

export const DEV_ACCOUNT_NAMES = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Ferdie"] as const;
export type DevAccountName = (typeof DEV_ACCOUNT_NAMES)[number];

export interface DevAccount {
  address: string;
  name: string;
  source: "dev";
  devName: DevAccountName;
}

type Keyring = import("@polkadot/keyring").Keyring;

let keyringPromise: Promise<Keyring> | null = null;

function getKeyring(): Promise<Keyring> {
  keyringPromise ??= (async () => {
    const { cryptoWaitReady } = await import("@polkadot/util-crypto");
    const { Keyring } = await import("@polkadot/keyring");
    await cryptoWaitReady();
    return new Keyring({ type: "sr25519", ss58Format: 42 });
  })();
  return keyringPromise;
}

/** The signing keypair for a dev account (used to sign extrinsics). */
export async function devPair(name: string): Promise<KeyringPair> {
  return (await getKeyring()).addFromUri(`//${name}`);
}

/** Public account info for a dev account (used for the wallet picker). */
export async function devAccount(name: DevAccountName): Promise<DevAccount> {
  const pair = await devPair(name);
  return { address: pair.address, name: `${name} (dev)`, source: "dev", devName: name };
}
