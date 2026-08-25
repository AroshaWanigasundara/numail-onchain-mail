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
    id: "production",
    name: "Production Node (Secure)",
    url: "wss://62.169.26.99:9946",
    secure: true,
    description: "Deployed NuMail node. Requires your node admin to have enabled TLS (wss://).",
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

export const PALLET_ERRORS: Record<string, string> = {
  MailboxNotFound: "That recipient has no NuMail mailbox yet. Ask them to create one first.",
  SenderBlocked: "This recipient has blocked your address.",
  PolicyRefused: "The recipient's acceptance policy refused this mail (contacts-only or trust score).",
  PostageRequired: "This recipient requires postage. Increase the attached postage and retry.",
  AttachmentNotAnchored: "One or more attachments are not anchored on DNC (Module 2).",
  FolderFull: "That folder has reached its on-chain capacity.",
  ThreadFull: "This conversation thread reached the maximum depth.",
};
