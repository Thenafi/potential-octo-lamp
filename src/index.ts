// This file is the entry point of the Cloudflare Worker. It listens for incoming webhook requests and processes the data to post messages to Slack.

import { WebhookPayload, SlackMessage } from './types';

// Configuration - Post to specific channel
const SLACK_CHANNEL_ID = 'C08R24HBK7F';
const SLACK_API_URL = 'https://slack.com/api/chat.postMessage';

// Environment interface for Cloudflare Workers
interface Env {
  SLACK_BOT_TOKEN: string;
}

// Channel routing logic - always post to the specified channel
function getSlackChannel(payload: WebhookPayload): string {
  return SLACK_CHANNEL_ID;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  }
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  
  // Check if the request is for the /messages endpoint
  if (url.pathname !== '/messages') {
    return new Response('Not Found - Use /messages endpoint', { status: 404 });
  }
  
  if (request.method === 'POST') {
    try {
      const payload: WebhookPayload = await request.json();
      await postToSlack(payload, env);
      return new Response('Message posted to Slack', { status: 200 });
    } catch (error) {
      console.error('Error processing request:', error);
      return new Response('Error processing request', { status: 400 });
    }
  } else {
    return new Response('Method not allowed - Use POST', { status: 405 });
  }
}

async function postToSlack(payload: WebhookPayload, env: Env): Promise<void> {
  const message = formatSlackMessage(payload);
  const channel = getSlackChannel(payload);
  
  // Use Slack Web API to post messages
  await postToSlackAPI(message, channel, env);
}

// Slack Web API approach (recommended)
async function postToSlackAPI(message: SlackMessage, channel: string, env: Env): Promise<void> {
  message.channel = channel;
  
  const response = await fetch(SLACK_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  const result = await response.json() as { ok: boolean; error?: string };
  
  if (!result.ok) {
    throw new Error(`Failed to post to Slack API: ${result.error || 'Unknown error'}`);
  }
}

function formatSlackMessage(payload: WebhookPayload): SlackMessage {
  const { data, action, created } = payload;
  
  // Determine the color based on sender type and platform
  const getColor = (senderType: string, platform: string): string => {
    if (platform === 'airbnb') {
      return senderType === 'guest' ? '#FF5A5F' : '#00A699';
    }
    return senderType === 'guest' ? '#ff6b6b' : '#4ecdc4';
  };

  // Format sender role display
  const getSenderRoleDisplay = (role: string | null, senderType: string): string => {
    if (!role) return senderType;
    return `${senderType} (${role})`;
  };

  // Create the main message text
  const mainText = `💬 New message from ${data.platform.toUpperCase()}`;
  
  const color = getColor(data.sender_type, data.platform);
  
  // Build the attachment with rich formatting
  const attachment = {
    color: color,
    author_name: data.sender.full_name,
    author_icon: data.sender.thumbnail_url,
    text: data.body,
    fields: [
      {
        title: 'Sender',
        value: getSenderRoleDisplay(data.sender_role, data.sender_type),
        short: true
      },
      {
        title: 'Platform',
        value: data.platform.charAt(0).toUpperCase() + data.platform.slice(1),
        short: true
      },
      {
        title: 'Conversation ID',
        value: `\`${data.conversation_id.substring(0, 8)}...\``,
        short: true
      },
      {
        title: 'Source',
        value: data.source.replace('_', ' ').toUpperCase(),
        short: true
      }
    ],
    footer: `${data.platform.toUpperCase()} Integration`,
    ts: Math.floor(new Date(created).getTime() / 1000)
  };

  // Add attachment information if present
  if (data.attachments && data.attachments.length > 0) {
    const attachmentInfo = data.attachments.map(att => 
      `📎 ${att.type}: ${att.url}`
    ).join('\n');
    
    attachment.fields.push({
      title: 'Attachments',
      value: attachmentInfo,
      short: false
    });
  }

  // Add reservation info if different from conversation
  if (data.reservation_id !== data.conversation_id) {
    attachment.fields.push({
      title: 'Reservation ID',
      value: `\`${data.reservation_id.substring(0, 8)}...\``,
      short: true
    });
  }

  return {
    text: mainText,
    attachments: [attachment]
  };
}