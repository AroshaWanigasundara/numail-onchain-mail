import { CONSTANTS } from "./types";

export type NameSource = "you" | "nickname" | "directory" | "address";

export interface NameContext {
  me?: string | undefined;
  /** private nicknames, kept in this browser */
  contacts: Record<string, string>;
  /** names published on chain */
  directory: Record<string, string>;
}

export interface ResolvedName {
  label: string;
  source: NameSource;
}

const shortAddress = (a: string, n = 6) => (a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);

/** Your nickname > the on-chain name > the short address. */
export function resolveName(address: string, ctx: NameContext, selfAs: "you" | "name" = "you"): ResolvedName {
  if (ctx.me && address === ctx.me && selfAs === "you") return { label: "You", source: "you" };
  const nick = ctx.contacts[address];
  if (nick) return { label: nick, source: "nickname" };
  const chain = ctx.directory[address];
  if (chain) return { label: chain, source: "directory" };
  return { label: shortAddress(address), source: "address" };
}

/** Same rules as the pallet, so mistakes are caught before a transaction is sent. */
export function validateDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (new TextEncoder().encode(name).length > CONSTANTS.MaxDisplayNameBytes) {
    return `At most ${CONSTANTS.MaxDisplayNameBytes} characters.`;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9._-]$/.test(name)) {
    return "Use at least 2 characters: letters, numbers, spaces, . _ - (start with a letter or number, no trailing space).";
  }
  return null;
}

export const isAddressLike = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(s);

/* ---------------------------------------------------------------- people search */

export interface Person {
  address: string;
  label: string;
  source: NameSource;
  nickname?: string | undefined;
  chainName?: string | undefined;
}

export function buildPeople(ctx: NameContext, extraAddresses: string[] = []): Person[] {
  const addresses = new Set<string>([...Object.keys(ctx.contacts), ...Object.keys(ctx.directory), ...extraAddresses]);
  const out: Person[] = [];
  for (const address of addresses) {
    if (address === ctx.me) continue;
    const r = resolveName(address, ctx, "name");
    out.push({ address, label: r.label, source: r.source, nickname: ctx.contacts[address], chainName: ctx.directory[address] });
  }
  return out;
}

export function searchPeople(people: Person[], query: string, exclude: Set<string>, limit = 8): Person[] {
  const q = query.trim().toLowerCase();
  const score = (p: Person): number => {
    if (!q) return p.source === "nickname" ? 1 : p.source === "directory" ? 2 : 3;
    const names = [p.nickname, p.chainName].filter((s): s is string => Boolean(s)).map((s) => s.toLowerCase());
    if (names.some((n) => n === q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    if (names.some((n) => n.includes(q))) return 2;
    if (p.address.toLowerCase().includes(q)) return 3;
    return Number.POSITIVE_INFINITY;
  };
  return people
    .filter((p) => !exclude.has(p.address))
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => a.s - b.s || a.p.label.localeCompare(b.p.label))
    .slice(0, limit)
    .map((x) => x.p);
}
