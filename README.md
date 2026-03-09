# Cloudflare Worker Slack Webhook

A Cloudflare Worker that receives Hospitable webhooks and posts formatted messages to Slack with rich formatting## Environment Variables

- `SLACK_BOT_TOKEN`: Your Slack Bot Token (required)
- `HOSPITABLE_API_TOKEN`: Your Hospitable API token (required)

## Features

- ✅ **Rich Slack Message Formatting**: Multiple message styles with colors, author info, and attachments
- ✅ **Hospitable Integration**: Fetches property details and reservation information via Hospitable API
- ✅ **Multiple Message Styles**: 4 different formatting styles (simple, blocks, attachment, minimal)
- ✅ **Conversation Redirection**: URL shortener for Hospitable inbox conversations
- ✅ **Slack Web API Integration**: Uses Slack Bot tokens for reliable message posting
- ✅ **TypeScript Support**: Fully typed for better development experience
- ✅ **Attachment Handling**: Processes and displays message attachments with smart URL formatting
- ✅ **ID Encoding**: Base64 URL-safe encoding for conversation and reservation IDs


## API Endpoints

### POST /messages
Main webhook endpoint for receiving Hospitable message notifications.

**Parameters:**
- `style` (optional): Message formatting style - `simple`, `blocks`, `attachment`, or `minimal`

**Example:**
```bash
POST https://your-worker.workers.dev/messages?style=blocks
```

### GET /conversation/{encoded_id}
Redirect endpoint that decodes conversation IDs and redirects to Hospitable inbox.

**Example:**
```
https://your-worker.workers.dev/conversation/abc123def456
# Redirects to: https://my.hospitable.com/inbox/thread/{decoded_id}
```

## Configuration

The worker is configured to post to a specific Slack channel (currently hardcoded). To modify the target channel, update the `SLACK_CHANNEL_ID` constant in `src/index.ts`:

```typescript
const SLACK_CHANNEL_ID = 'C08R24HBK7F'; // Your Slack channel ID
```

## Setup

1. **Create a Slack App:**
   - Go to https://api.slack.com/apps
   - Create a new app and add the `chat:write` OAuth scope
   - Install the app to your workspace
   - Copy the Bot Token (starts with `xoxb-`)

2. **Create a Hospitable API Token:**
   - Generate an API token in your Hospitable account
   - Ensure it has permissions to read reservations and properties

3. **Configure Environment Variables:**
   ```bash
   # Set Slack bot token
   wrangler secret put SLACK_BOT_TOKEN

   # Set Hospitable API token  
   wrangler secret put HOSPITABLE_API_TOKEN
   ```

## Deployment

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Deploy to Cloudflare Workers
wrangler deploy
```

## Webhook Payload

The worker expects Hospitable webhook payloads in this format:

```json
{
  "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "data": {
    "platform": "airbnb",
    "conversation_id": "12345678-1234-1234-1234-123456789012",
    "reservation_id": "87654321-4321-4321-4321-210987654321",
    "sender_type": "guest",
    "sender_role": "host",
    "body": "Hello, there.",
    "sender": {
      "first_name": "Jane",
      "full_name": "Jane Doe",
      "locale": "en",
      "picture_url": "https://...",
      "thumbnail_url": "https://...",
      "location": "New York, NY"
    },
    "attachments": [
      {
        "type": "image",
        "url": "https://example.com/image.jpg"
      }
    ],
    "source": "PUBLIC_API",
    "created_at": "2024-10-08T07:03:34Z"
  },
  "action": "message.created",
  "created": "2024-10-08T07:03:34Z"
}
```

## Example Slack Message Output

The formatted message will appear in Slack as:

**Simple Style (Default):**
```
� Jane Doe (Airbnb)
🏠 Property: Cozy Downtown Apartment (ID: prop_123)

```
Hello, there.
```

Source: PUBLIC API
Conversation: YWJjMTIzNDU2Nzg5
Reservation: ZGVmOTg3NjU0MzIx

🔗 Open in Hospitable Inbox

Attachments
• image: image.jpg
```

**Blocks Style:**
Modern Slack blocks layout with profile images, structured sections, and rich formatting.

**Attachment Style:**
Traditional colored sidebar attachments with field-based layout.

**Minimal Style:**
```
👤 Jane Doe | Airbnb guest | 🏠 Cozy Downtown Apartment (prop_123) | "Hello, there." | Conv:YWJjMTIz | 🔗 Open in Hospitable Inbox
```

## Environment Variables

- `SLACK_BOT_TOKEN`: Your Slack Bot Token (required)
- `HOSPITABLE_API_TOKEN`: Your Hospitable API token (required)

## Development

```bash
# Start development server
wrangler dev

# Test webhook locally with different styles
curl -X POST http://localhost:8787/messages?style=simple \
  -H "Content-Type: application/json" \
  -d @test-payload.json

curl -X POST http://localhost:8787/messages?style=blocks \
  -H "Content-Type: application/json" \
  -d @test-payload.json

# Test conversation redirect
curl http://localhost:8787/conversation/YWJjMTIzNDU2Nzg5
```


## Architecture

- **Runtime**: Cloudflare Workers (Edge computing)
- **Language**: TypeScript
- **APIs**: Slack Web API, Hospitable Public API v2
- **Message Formats**: Slack Blocks, Attachments, Plain Text

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
