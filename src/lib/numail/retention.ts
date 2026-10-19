import { CONSTANTS } from "./types";

export type ExpiryUrgency = "calm" | "soon" | "urgent";

export interface MailExpiry {
  expiryBlock: number;
  blocksLeft: number;
  secondsLeft: number;
  expiresAt: Date;
  /** calm: > 1 day left · soon: ≤ 1 day · urgent: ≤ 1 hour */
  urgency: ExpiryUrgency;
}

/**
 * Estimated auto-deletion point of one mail: delivery block + retention window,
 * which is exactly how the pallet schedules it. Returns null when there is nothing
 * to show (no policy, or the window already passed — i.e. the mail predates the policy).
 */
export function mailExpiry(deliveredBlock: number, retention: number | undefined, headBlock: number): MailExpiry | null {
  if (!retention || retention <= 0) return null;
  const expiryBlock = deliveredBlock + retention;
  const blocksLeft = expiryBlock - headBlock;
  if (blocksLeft <= 0) return null;
  const secondsLeft = blocksLeft * CONSTANTS.BlockTimeSeconds;
  return {
    expiryBlock,
    blocksLeft,
    secondsLeft,
    expiresAt: new Date(Date.now() + secondsLeft * 1000),
    urgency: secondsLeft <= 3_600 ? "urgent" : secondsLeft <= 86_400 ? "soon" : "calm",
  };
}

export function formatTimeLeft(seconds: number): string {
  if (seconds < 60) return "<1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
