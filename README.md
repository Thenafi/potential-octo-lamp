# Cloudflare Worker Slack Webhook

This project implements # Cloudflare Worker Slack Webhook

A Cloudflare Worker that acts as a webhook receiver to post formatted messages to Slack with intelligent channel routing.

## Features

- ✅ **Rich Slack Message Formatting**: Beautiful, structured messages with colors, author info, and attachments
- ✅ **Smart Channel Routing**: Route messages to different channels based on platform, sender type, or custom logic
- ✅ **Multiple Integration Methods**: Support for both Slack Web API (recommended) and Incoming Webhooks
- ✅ **TypeScript Support**: Fully typed for better development experience
- ✅ **Configurable**: Easy configuration for different platforms and routing strategies

## Channel Routing Options

### Option 1: Slack Web API (Recommended) ⭐
**Pros:**
- Can post to ANY channel dynamically
- Better error handling and responses
- Access to advanced Slack features
- Rate limiting information

**Setup:**
1. Create a Slack App at https://api.slack.com/apps
2. Add the `chat:write` OAuth scope
3. Install the app to your workspace
4. Get the Bot Token (starts with `xoxb-`)
5. Set it as a Wrangler secret: `wrangler secret put SLACK_BOT_TOKEN`

### Option 2: Incoming Webhooks
**Pros:**
- Simple setup
- No token management

**Cons:**
- Fixed to one channel only
- Limited customization

**Setup:**
1. Create an Incoming Webhook in Slack
2. Update `SLACK_WEBHOOK_URL` in the code

## Channel Routing Configuration

Edit `/src/config.ts` to configure channel routing:

```typescript
export const SLACK_CHANNEL_CONFIG: ChannelConfig[] = [
  {
    platform: 'airbnb',
    channel: '#airbnb-messages',
    senderTypeRouting: {
      guest: '#airbnb-guest-messages',
      host: '#airbnb-host-messages'
    }
  },
  // Add more platforms...
];
```

### Available Routing Strategies:

1. **By Platform**: Different channels for Airbnb, Booking.com, etc.
2. **By Sender Type**: Separate channels for guests vs hosts
3. **By Platform + Sender**: Combination routing (e.g., `#airbnb-guest-messages`)
4. **By Content**: Route urgent messages to priority channels
5. **By Time**: Business hours vs after-hours routing
6. **By Reservation**: Property-specific channels

## Deployment

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Deploy to Cloudflare Workers
wrangler publish

# Set your Slack bot token (for Web API)
wrangler secret put SLACK_BOT_TOKEN
```

## Webhook Payload

The worker expects webhook payloads in this format:

```json
{
  "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "data": {
    "platform": "airbnb",
    "sender_type": "host|guest",
    "sender_role": "host|co-host|teammate|null",
    "body": "Hello, there.",
    "sender": {
      "full_name": "Jane Doe",
      "thumbnail_url": "https://..."
    },
    // ... more fields
  },
  "action": "message.created",
  "created": "2024-10-08T07:03:34Z"
}
```

## Example Slack Message Output

The formatted message will appear in Slack as:

```
💬 New message from AIRBNB

Jane Doe
Hello, there.

Sender: guest (teammate)    Platform: Airbnb
Conversation ID: becd1474...    Source: PUBLIC API

📎 Attachments
📎 image: https://example.com/image.jpg

AIRBNB Integration • Today at 2:03 PM
```

## Environment Variables

- `SLACK_BOT_TOKEN`: Your Slack Bot Token (for Web API method)
- `SLACK_WEBHOOK_URL`: Your Slack Webhook URL (for webhook method)

## Development

```bash
# Start development server
wrangler dev

# Test webhook locally
curl -X POST http://localhost:8787 
  -H "Content-Type: application/json" 
  -d @test-payload.json
```
 

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [License](#license)

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd cloudflare-worker-slack-webhook
   ```

2. Install the dependencies:
   ```
   npm install
   ```

## Usage

To deploy the Cloudflare Worker, use the following command:
```
npx wrangler publish
```

Once deployed, the worker will listen for incoming webhook requests. You can send a POST request to the worker's URL with the necessary data to post messages to Slack.

## Configuration

To configure the webhook and Slack integration, update the `wrangler.toml` file with your Cloudflare account details and the Slack webhook URL in the `src/index.ts` file.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.