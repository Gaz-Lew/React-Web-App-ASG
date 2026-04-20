# DocuSign Integration — Production Setup Guide

## Environment Variables

```bash
firebase functions:config:set \
  docusign.integrator_key="YOUR_INTEGRATOR_KEY" \
  docusign.user_id="YOUR_USER_UUID" \
  docusign.account_id="YOUR_ACCOUNT_UUID" \
  docusign.base_uri="https://demo.docusign.net/restapi" \
  docusign.private_key="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----" \
  docusign.webhook_secret="YOUR_HMAC_SHARED_SECRET" \
  compliance_email="compliance@yourcompany.com" \
  functions_url="https://YOUR_PROJECT.web.app"
```

### Webhook HMAC Secret

In DocuSign Connect settings:

1. Go to **Settings → Connect**
2. Create or edit your configuration
3. Under **Security**, set a shared secret (any strong random string)
4. This secret is used for HMAC-SHA256 signature validation

### Production

For production, change `base_uri` to: `https://account.docusign.com/oauth`

## Firestore Collections

### docusignEnvelopes

| Field                | Type         | Description                    |
| -------------------- | ------------ | ------------------------------ |
| dealId               | string       | Parent deal                    |
| clientId             | string       | Client ID                      |
| envelopeId           | string       | DocuSign envelope UUID         |
| oaDocumentInstanceId | string\|null | Link to document instance      |
| documentUrl          | string       | Source PDF URL                 |
| documentName         | string       | PDF filename                   |
| clientName           | string       | Client display name            |
| clientEmail          | string       | Client email for signing       |
| signers              | array        | [{email, name, routingOrder}]  |
| status               | string       | sent/completed/declined/voided |
| sentBy               | string       | Firebase auth UID              |
| viewingUrl           | string       | Link to view in DocuSign       |
| signedUrl            | string       | Signed PDF storage URL         |
| signedStoragePath    | string       | Storage path                   |
| lastProcessedEventId | string       | Idempotency guard              |
| resentAt             | timestamp    | Last resend time               |
| voidedReason         | string       | Reason for voiding             |
| syncedAt             | timestamp    | Last API sync time             |
| createdAt            | timestamp    | Creation time                  |
| updatedAt            | timestamp    | Last update time               |

### dealEvents

| Field     | Type      | Description                                            |
| --------- | --------- | ------------------------------------------------------ |
| dealId    | string    | Parent deal                                            |
| type      | string    | docusign*sent/completed/declined/voided/resent/sync*\* |
| message   | string    | Human-readable description                             |
| createdBy | string    | User ID or "system"                                    |
| metadata  | object    | envelopeId, signedUrl, etc.                            |
| createdAt | timestamp | Event time                                             |

### documentInstances

| Field      | Type      | Description                   |
| ---------- | --------- | ----------------------------- |
| status     | string    | draft/completed/signed/locked |
| editable   | boolean   | false when locked             |
| envelopeId | string    | Linked DocuSign envelope      |
| signedUrl  | string    | Signed document URL           |
| signedAt   | timestamp | When document was signed      |

## Security

### HMAC Signature + Replay Protection

- All webhook requests validated using HMAC-SHA256 via `X-DocuSign-Signature` header
- Timestamp validation: events older than 5 minutes are **rejected**
- Prevents replay attacks even with valid signatures

### Idempotent Processing

- `lastProcessedEventId` prevents duplicate event processing
- Already-completed envelopes ignore further completion events

### Duplicate Send Prevention

- Before creating an envelope, backend checks for existing active envelope
- Returns `already-exists` error — frontend shows confirmation modal with resend option

### Document Locking

- When envelope is sent, document instance status → `locked`, `editable: false`
- Prevents further edits to the document

### Authentication

- All callable functions require Firebase Auth
- No DocuSign keys exposed to frontend

## Deploy

```bash
cd functions && npm install && cd ..
npm run deploy -- --only functions
```

## UI Features

### Mobile UX

- "Send to DocuSign" button is full-width on mobile (`w-full`), normal on desktop
- Footer wraps responsively with `flex-col` on mobile, `flex-row` on sm+

### Status Badges

| Status      | Color | Badge Text                | Actions                        |
| ----------- | ----- | ------------------------- | ------------------------------ |
| `sent`      | Amber | ⏳ Waiting for signature… | Resend, View in DocuSign, Void |
| `completed` | Green | ✅ Signed                 | —                              |
| `declined`  | Red   | ❌ Declined               | —                              |
| `voided`    | Grey  | 🚫 Voided                 | —                              |

### Signed Banner

- Green banner appears at footer: "Document signed successfully" with dismiss button

### View in DocuSign

- When envelope is sent, "View in DocuSign" button appears
- Opens DocuSign envelope viewer in new tab

### File Naming Standard

Signed PDFs: `{clientName}_{dealId}_OA_Signed_{YYYYMMDD}.pdf`

- All illegal characters replaced with underscores
- Client name truncated to 50 chars, deal ID to 30 chars

## Status Sync (Failsafe)

- `syncEnvelopeStatus(onCall)` — on-demand check against DocuSign API
- Called when loading deal/document to detect mismatches
- Automatically corrects Firestore status if mismatch found
- Records correction event in dealEvents timeline
