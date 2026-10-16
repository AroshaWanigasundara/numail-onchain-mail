export type PolicyKind = "Open" | "ContactsOnly" | "MinTrustScore" | "PostageRequired";

export interface MailboxPolicy {
  kind: PolicyKind;
  /** used for MinTrustScore */
  minTrustScore?: number | undefined;
  /** used for PostageRequired, in plancks (display unit handled in UI) */
  postage?: number | undefined;
}

export interface Mailbox {
  owner: string;
  policy: MailboxPolicy;
  retention?: number | undefined;
  folders: string[];
  createdAtBlock: number;
  createdAt: number;
}

export type DeliveryStatus = "Delivered" | "Read" | "Archived" | "Tombstoned";

export interface Attachment {
  name: string;
  size: number;
  cid: string;
  anchored: boolean;
}

export interface MailEnvelope {
  mailId: string;
  sender: string;
  recipients: string[];
  subjectHash: string;
  bodyRef: string;
  attachments: Attachment[];
  threadParent?: string | undefined;
  block: number;
  timestamp: number;
  postage?: number | undefined;
}

export interface DeliveryState {
  mailId: string;
  account: string;
  status: DeliveryStatus;
  folder: string;
}

export interface NumailEvent {
  id: string;
  type:
    | "MailSent"
    | "MailDelivered"
    | "MailRead"
    | "MailTombstoned"
    | "SenderBlocked"
    | "SenderUnblocked"
    | "PolicyUpdated"
    | "MailboxCreated"
    | "MailMoved";
  mailId?: string | undefined;
  account?: string | undefined;
  timestamp: number;
  detail: string;
}

export const CONSTANTS = {
  MaxRecipients: 16,
  MaxAttachments: 8,
  MaxFolders: 12,
  MaxSubjectBytes: 256,
  MaxBodyBytes: 65536,
  MaxThreadDepth: 64,
  MaxBlocklist: 128,
  BlockTimeSeconds: 6,
  MaxFolderNameBytes: 32,   // runtime MaxFolderNameLen
} as const;

export const DEFAULT_FOLDERS = ["inbox", "sent", "archive"];

export interface EndpointPreset {
  id: string;
  name: string;
  url: string;
  secure: boolean;
  description: string;
}

export const ENDPOINT_PRESETS: EndpointPreset[] = [
  {
    id: "local",
    name: "Local Development",
    url: "ws://localhost:9944",
    secure: false,
    description: "Use when running a Substrate node locally. Only works on http:// or localhost pages.",
  },
  {
    id: "dev-node",
    name: "My Node (Development)",
    url: "ws://IPAddress:9944",
    secure: false,
    description:
      "Your development node over plain ws://. Replace IPAddress with your node's address. Works when the app is served over http:// (or localhost) — browsers block ws:// from https:// pages.",
  },
  {
    id: "production",
    name: "Production Node (Secure)",
    url: "wss://IPAddress:9944",
    secure: true,
    description:
      "Your node over TLS. Replace IPAddress with your secure domain or node address (wss:// needs a valid certificate).",
  },
  {
    id: "rococo",
    name: "Public Rococo Testnet",
    url: "wss://rococo-rpc.polkadot.io",
    secure: true,
    description: "Public community node. No setup required, but slower and without the NuMail pallet.",
  },
];

export const ENDPOINT_STORAGE_KEY = "numail_rpc_endpoint";

/** Used on a first visit, before the user has chosen an endpoint. */
export const DEFAULT_ENDPOINT = "wss://on-chain-email-pallet.projectfreedom.io/ws";

export const PALLET_ERRORS: Record<string, string> = {
  MailboxNotFound: "That recipient has no NuMail mailbox yet. Ask them to create one first.",
  SenderBlocked: "This recipient has blocked your address.",
  PolicyRefused: "The recipient's acceptance policy refused this mail (contacts-only or trust score).",
  PostageRequired: "This recipient requires postage. Increase the attached postage and retry.",
  AttachmentNotAnchored: "One or more attachments are not anchored on DNC (Module 2).",
  FolderFull: "That folder has reached its on-chain capacity.",
  ThreadFull: "This conversation thread reached the maximum depth.",
  NotRecipient: "Only a recipient of this mail can change its delivery state on chain.",
  NotAuthorized: "This account is not allowed to perform that action on this mail.",
  MailNotFound: "That mail no longer exists on chain.",
  NoRecipients: "Add at least one recipient before sending.",
  TooManyRecipients: "This mail has more recipients than the chain allows.",
  TooManyAttachments: "This mail has more attachments than the chain allows.",
  EncryptedBodyTooLarge: "The encrypted message is too large for the chain. Shorten it and retry.",
  EncryptedKeyTooLarge: "A recipient's encrypted key is too large for the chain.",
  EncryptedKeyCountMismatch: "Each recipient needs their own encrypted key — please retry sending.",
  EncryptedKeyRecipientMismatch: "An encrypted key did not match a recipient of this mail.",
  RecipientPolicyRefused: "The recipient's acceptance policy refused this mail (contacts-only or trust score).",
  RequireSudo: "Only the chain's sudo account can send system notices.",
  BadOrigin: "Only the chain's sudo account can send system notices.",
  EmptyFolderName: "Folder name cannot be empty.",
  FolderAlreadyExists: "You already have a folder with that name.",
  FolderNotFound: "That folder does not exist in your mailbox.",
  FolderNotEmpty: "This folder still contains mail. Move or delete its mail first.",
  ProtectedFolder: "Inbox, sent and archive are required and cannot be deleted.",
  TooManyFolders: "Your mailbox has reached its maximum number of folders.",
  FolderNameTooLong: "That folder name is too long.",
};
