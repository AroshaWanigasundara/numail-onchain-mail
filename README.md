# NuMail Connect

Complete AI Prompt for Lovable.dev — NuMail Frontend (Copy & Paste Ready)

You are building a complete frontend web application for the NuMail Pallet (Module 13 — On-Chain Email) 
on the Polkadot blockchain.

## PROJECT OVERVIEW

NuMail is an on-chain email/correspondence system where users can:
- Create mailboxes with acceptance policies (Open, ContactsOnly, MinTrustScore, PostageRequired)
- Send mail to multiple recipients with encrypted subject/body and attachments
- Receive mail in a folder-based inbox system
- Mark mail as read, move between folders, or delete (tombstone)
- Thread conversations (replies to mail items)
- Block/unblock senders
- Update mailbox policies and settings

## TECHNICAL REQUIREMENTS

### Frontend Tech Stack
- **Framework**: React with TypeScript
- **Blockchain**: Polkadot.js SDK (connect to Substrate chain)
- **Wallet Integration**: Polkadot.js extension wallet
- **Styling**: Tailwind CSS or similar (modern, professional, responsive)
- **State Management**: React Context or Zustand (for wallet connection + mail state)
- **UI Components**: shadcn/ui or similar component library (for form inputs, modals, tables)
- **API Calls**: Fetch mail data from blockchain storage, handle extrinsic submissions

### Core Features to Implement

#### 1. Authentication & Wallet Connection
- "Connect Wallet" button (Polkadot.js extension)
- Display connected account address
- Show account balance (if available)
- Disconnect option
- Error handling for missing wallet

#### 2. Mailbox Setup (First-Time User)
- "Create Mailbox" form with:
  - Policy dropdown (Open / ContactsOnly / MinTrustScore(number) / PostageRequired(amount))
  - Optional retention window (block number)
  - Folder creation: add custom folder names (inbox is always default)
  - Submit button to create_mailbox extrinsic
- Success/error notifications
- Check if mailbox already exists (prevent duplicate creation)

#### 3. Inbox / Mail List View
- Display all mail in the selected folder (default: "inbox")
- Show:
  - From (sender address)
  - Subject (currently shows as hash, explain client decrypts this)
  - Date sent (block number → readable date)
  - Status (Delivered / Read / Archived / Tombstoned)
  - Action buttons: Open, Mark Read, Move to Folder, Delete (Tombstone)
- Folder sidebar:
  - List all declared folders
  - Show unread count per folder
  - Click to filter mail by folder
- Search/filter bar (search by sender or date range)
- Pagination (if many mails)

#### 4. Compose Mail / Send Mail
- Modal/form to send new mail with:
  - Recipients input (multi-select account IDs or autocomplete)
  - Subject field (plain text, client encrypts before sending)
  - Body field (rich text optional, or plain text + formatting hints)
  - Attachments uploader (mark as anchored via DNC mock, or explain it's external)
  - Thread parent selector (reply to existing mail, optional dropdown)
  - Postage indicator (if recipient requires postage, show cost)
  - Send button → calls send_mail extrinsic
- Validation:
  - Max recipients (typically 16)
  - Max attachments (typically 8)
  - Require at least one recipient
- Success notification with MailId
- Error handling (policy refused, postage required, attachment not anchored, etc.)

#### 5. Mail Detail View
- Click mail item to open full view:
  - From / To / Date / Thread info
  - Subject (decrypted, show as text)
  - Body (decrypted, show as text or formatted)
  - Attachments list (if any, with download/preview buttons)
  - Thread visualization (if part of conversation, show parent/child links)
- Action buttons:
  - Mark as Read (if Delivered)
  - Move to Folder (dropdown)
  - Delete (Tombstone)
  - Reply (opens compose modal with this mail as thread_parent)
  - Block Sender (add to blocklist)

#### 6. Settings Panel
- Update mailbox policy:
  - Policy dropdown + new retention window
  - Submit to set_mailbox_policy extrinsic
- Blocklist management:
  - List of blocked senders
  - Remove (unblock) individual entries
  - Add new sender to blocklist (input + submit to block_sender)
- View constants (MaxRecipients, MaxAttachments, MaxFolders, etc.)
- Profile/account info (address, balance, mailbox created date)

#### 7. Event Listener & Real-Time Updates
- Subscribe to chain events from pallet-numail:
  - MailSent: Update sent folder
  - MailDelivered: Update inbox for recipient (if listening)
  - MailRead: Update status badges
  - MailTombstoned: Remove from folder view
  - SenderBlocked: Update blocklist UI
  - PolicyUpdated: Refresh settings display
- Auto-refresh mail list when new mail arrives
- Toast notifications for incoming mail

#### 8. Folder Management
- View all declared folders in sidebar
- Create new folder (during mailbox setup only, or in settings?)
- Move mail between folders via move_to_folder extrinsic
- Show mail count per folder
- Archive/Delete buttons (shortcut for moving to archive or tombstoning)

#### 9. Search & Filter
- Search by sender address
- Filter by folder
- Filter by date range
- Filter by read status (Read / Unread)

#### 10. Error Handling & User Feedback
- Display clear error messages for:
  - Mailbox not found (recipient doesn't exist)
  - Sender blocked
  - Recipient policy refused (contacts-only, trust score, etc.)
  - Postage required (show required amount)
  - Attachment not anchored
  - Folder full / thread full
  - Network errors
- Loading indicators for extrinsic submissions
- Confirmation modals for destructive actions (tombstone, block)

## DESIGN & UX REQUIREMENTS

### Visual Design
- **Color Scheme**: Professional, clean (blues/grays with accent colors)
- **Layout**: Sidebar navigation + main content area
- **Responsive**: Mobile-friendly (hamburger menu on mobile)
- **Icons**: Use Lucide React or similar for mail, folder, settings, delete, etc.
- **Typography**: Clear hierarchy, readable font sizes

### Navigation
- Left sidebar with:
  - Connected account info (address + disconnect button)
  - Folder list (inbox, sent, archive, custom folders)
  - Settings link
  - Logout/disconnect button
- Top navigation bar with:
  - App logo/title ("NuMail")
  - Compose button (prominent)
  - Search bar
  - Profile dropdown

### Responsive Breakpoints
- Mobile: Single column, hamburger menu
- Tablet: Sidebar + content
- Desktop: Full layout

## BLOCKCHAIN ENDPOINT CONFIGURATION

### Problem
The endpoint ws://62.169.26.99:9946 is **insecure** (unencrypted WebSocket). Modern browsers block 
insecure WebSocket connections (ws://) when connecting from HTTPS pages (like Lovable preview/deployed app).

**Error you'll see**: "Mixed Content: The page was loaded over HTTPS, but requested an insecure WebSocket 
connection to 'ws://62.169.26.99:9946'."

### Solution: User-Configurable Endpoint UI

#### 1. Endpoint Configuration Panel (in Settings)

Add a **"Network Settings"** section in the Settings panel with:

**Endpoint Input**:
- Text input field for WebSocket URL
- Default value: ws://62.169.26.99:9946 (or blank)
- Help text explaining the ws:// vs wss:// issue:


"Enter your Substrate node WebSocket endpoint.

⚠️ Security Note:

ws:// (insecure): Works on localhost/http pages only

wss:// (secure): Works on https pages (Lovable preview/deployed)

For local development: ws://localhost:9944 For production/https: Use wss:// endpoint (requires secure node setup) or use a public node with wss:// like wss://rococo-rpc.polkadot.io"


**Preset Buttons** (quick select):
- "Local Development" → ws://localhost:9944
- "Production (Secure)" → wss://62.169.26.99:9946 (if available)
- "Public Rococo Testnet" → wss://rococo-rpc.polkadot.io
- Custom → opens text input for manual entry

**Connection Status Indicator**:
- Visual badge showing:
- 🟢 Connected (green)
- 🟡 Connecting... (yellow, spinner)
- 🔴 Disconnected (red)
- ❌ Connection Error (red with error tooltip)
- Show last attempted endpoint
- Show timestamp of last successful connection

**Test Connection Button**:
- Button to test the endpoint before saving
- Show result: "✓ Connected to node" or "✗ Failed to connect: [error message]"
- Saves endpoint to localStorage only if test succeeds

**Save & Apply Button**:
- Save endpoint to localStorage
- Auto-reconnect Polkadot.js API with new endpoint
- Show confirmation toast

#### 2. Connection Status in Header/Navbar

Add to top navigation bar:
- **Connection Status Badge**: Shows endpoint + status
- **Click to Expand**: Shows full URL + connection details
- **Fallback Message**: If no endpoint configured, show "⚙️ Configure Endpoint" link in header

#### 3. First-Run Onboarding

If no endpoint is configured on app load:
- Show a **"Configure Blockchain Connection"** modal/banner
- Provide:
- Explanation of what WebSocket endpoint is
- Preset options (Local, Production, Testnet)
- Or manual input
- "Test Connection" button
- "Continue" button (disabled until test passes)
- Don't allow full app usage until endpoint is set

#### 4. Error Handling & Recovery

**Connection Failure Cases**:
- If endpoint becomes unreachable during use:
- Show error toast: "Disconnected from blockchain node"
- Disable all extrinsic submission buttons (mark as "Offline")
- Show "Reconnect" button
- Auto-retry every 5 seconds (with exponential backoff)
- Allow user to manually change endpoint in Settings

**Mixed Content Error** (ws:// on HTTPS page):
- Catch the error specifically
- Show helpful message: "Insecure WebSocket (ws://) detected on secure page (https://). Use a wss:// endpoint or run on http://localhost."
- Suggest solutions:
- "Use a production endpoint with wss://"
- "Run locally with ws://localhost:9944"
- Link to setup guide

#### 5. Endpoint Storage & Persistence

- Save selected endpoint to **localStorage** as:
localStorage.setItem("numail_rpc_endpoint", "ws://localhost:9944");
- On app load, retrieve and auto-connect to saved endpoint
- Allow reset to defaults

#### 6. UI Components

**Settings Form**:


Network Settings ┌──────────────────────────────────────────────┐ │ WebSocket Endpoint Configuration │ ├──────────────────────────────────────────────┤ │ │ │ Preset Endpoints: │ │ [Local Dev] [Production] [Rococo Testnet] │ │ │ │ Custom Endpoint: │ │ [ws://localhost:9944______________] 🧪 Test │ │ │ │ Connection Status: 🟢 Connected │ │ Endpoint: ws://localhost:9944 │ │ Last connected: 2 minutes ago │ │ │ │ ℹ️ Security Note: ws:// only works on │ │ http/localhost. For https, use wss:// │ │ │ │ [Cancel] [Save & Reconnect] │ └──────────────────────────────────────────────┘


**Header Badge**:


🟢 Connected to ws://localhost:9944


#### 7. Code Implementation Notes

**Polkadot.js API Init**:
```javascript
const endpoint = localStorage.getItem("numail_rpc_endpoint") || "ws://localhost:9944";
const wsProvider = new WsProvider(endpoint);
const api = new ApiPromise({ provider: wsProvider });

wsProvider.on("connected", () => setConnected(true));
wsProvider.on("disconnected", () => setConnected(false));
wsProvider.on("error", (error) => handleConnectionError(error));


Error Detection:

if (error.message.includes("Mixed Content")) {
  showError("Insecure WebSocket on HTTPS page. Use wss:// or http://localhost");
}


Retry Logic:

const reconnect = () => {
  wsProvider.connect().catch(() => {
    setTimeout(reconnect, Math.min(retryCount * 1000, 30000));
  });
};


8. Configuration Presets

Define these as app constants:

const ENDPOINTS = {
  local: {
    name: "Local Development",
    url: "ws://localhost:9944",
    secure: false,
  },
  production: {
    name: "Production Node (Secure)",
    url: "wss://62.169.26.99:9946",
    secure: true,
  },
  rococo: {
    name: "Rococo Testnet",
    url: "wss://rococo-rpc.polkadot.io",
    secure: true,
  },
};


9. Display Guidance

Show inline help text in Settings:

📌 Which endpoint should I use?

Local Development (ws://localhost:9944)
- Use this when running a Substrate node locally
- Only works on http:// pages or localhost
- Best for development

Production (wss://...)
- Use this for deployed/preview versions
- Requires wss:// (secure WebSocket)
- Your node admin must enable wss://

Public Testnet (wss://rococo-rpc.polkadot.io)
- Public node for testing
- No setup required
- Slower, community-run


DATA FLOW & INTEGRATION POINTS

WebSocket Endpoint Configuration

Default endpoint: User-configurable in Settings (Network panel)

Supported protocols: ws:// (development), wss:// (production)

Auto-reconnect on disconnection with exponential backoff

Connection status badge in header (🟢 Connected / 🔴 Disconnected)

Error handling for mixed content (ws:// on https://) with helpful suggestions

Endpoint persistence: Save to localStorage

Presets: Local Dev, Production (Secure), Rococo Testnet, Custom

Test Connection button to validate endpoint before saving

Blockchain Queries

Query pallet_numail.mailboxes(accountId) → get policy, folders, retention

Query pallet_numail.mailItems(mailId) → get envelope

Query pallet_numail.deliveryState(mailId, accountId) → get status

Query pallet_numail.mailboxIndex(accountId, folderId) → get mail IDs in folder

Query pallet_numail.blocklists(accountId) → get blocked senders

Extrinsic Submissions

create_mailbox(policy, retention, folders)

send_mail(recipients, subject_hash, body_ref, attachments, thread_parent)

mark_read(mail_id)

tombstone(mail_id)

move_to_folder(mail_id, folder)

set_mailbox_policy(policy, retention)

block_sender(blocked_address)

unblock_sender(unblocked_address)

Off-Chain Notes

Encryption: Subject & body are encrypted client-side. Hashes sent to chain. Actual encrypted content stored off-chain (mock with localStorage or external indexer).

Attachments: Must be anchored via DNC (Module 2) before sending. For MVP, mock this or explain it as external requirement.

MOCKUP / USER FLOWS

Flow 1: First-Time Setup

User connects wallet

App detects no mailbox exists

Show "Create Mailbox" form

User selects policy, adds folders, submits

Wait for confirmation → show "Mailbox created!"

Redirect to empty inbox

Flow 2: Send Mail

User clicks "Compose" button

Modal opens with form (recipients, subject, body, attachments)

User fills in details

User clicks "Send"

App hashes subject/body, submits extrinsic

Poll for event (MailSent)

Success notification → close modal, add to sent folder

Flow 3: Receive & Read Mail

User receives event (MailDelivered)

Mail appears in inbox

User clicks mail to open

Show decrypted subject & body

User clicks "Mark Read" → extrinsic submitted

Status updates to "Read", postage (if any) released

Flow 4: Thread Reply

User is viewing a mail

Clicks "Reply" button

Compose modal opens with thread_parent = this mail_id

User types reply, sends

Mail links to original conversation

ADDITIONAL REQUIREMENTS

Loading States: Show spinners during extrinsic submissions

Toast Notifications: Success/error messages for actions

Confirmation Modals: Before deleting (tombstone) or blocking senders

Accessibility: ARIA labels, keyboard navigation, readable contrast

Dark Mode (optional but nice): Toggle in settings

Local Storage: Cache user settings (theme, recent contacts, etc.)

CONTENT & COPY

Use clear, professional language

Explain blockchain concepts to non-technical users (tooltips for "tombstone", "policy", "postage", etc.)

Error messages should be actionable (explain what went wrong and how to fix it)

TESTING NOTES

Create mock data for development (pre-populate some mail items for UI testing)

Test with Polkadot.js extension connected to local dev chain (or testnet)

Test all 8 extrinsics + error paths

Test real-time event updates

DELIVERABLES

Full working React frontend with Polkadot.js integration

All 10 core features implemented

Mobile-responsive design

Error handling + user feedback

Event listener for real-time updates

Clean, maintainable TypeScript code

Configurable WebSocket endpoint with presets

Connection status badge in header

Network Settings panel in Settings

First-run endpoint setup onboarding

Automatic retry with exponential backoff

localStorage persistence for endpoint selection

Test Connection button + validation

Helpful error messages for mixed content (ws:// on https://)

Preset endpoints: Local Dev, Production (Secure), Rococo Testnet

Build this as a production-quality email client for the NuMail blockchain pallet. Make it beautiful, functional, and easy to use. The app must handle both insecure (ws://) and secure (wss://) WebSocket endpoints gracefully, with a user-friendly configuration interface that guides users to the correct endpoint for their use case.


---

## ✅ Ready to Copy & Paste!

Just:
1. **Select all** the text above (from "You are building..." to the end)
2. **Copy** it
3. **Go to [Lovable.dev](https://lovable.dev/dashboard)**
4. **Paste** into the chat/prompt area
5. **Click Send/Build**

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d43b537b-8dc5-49c8-bc6b-f19c6b8c2e4e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
