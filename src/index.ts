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
  const styleParam = (url.searchParams.get('style') || '').toLowerCase();
  const style: MessageStyle = styleParam === 'blocks' || styleParam === 'minimal' || styleParam === 'attachment' ? styleParam as MessageStyle : 'attachment';
  await postToSlack(payload, env, style);
      return new Response('Message posted to Slack', { status: 200 });
    } catch (error) {
      console.error('Error processing request:', error);
      return new Response('Error processing request', { status: 400 });
    }
  } else {
    return new Response('Method not allowed - Use POST', { status: 405 });
  }
}

type MessageStyle = 'attachment' | 'blocks' | 'minimal';

async function postToSlack(payload: WebhookPayload, env: Env, style: MessageStyle): Promise<void> {
  const message = formatSlackMessage(payload, style);
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

function formatSlackMessage(payload: WebhookPayload, style: MessageStyle): SlackMessage {
  switch (style) {
    case 'blocks':
      return buildBlocksMessage(payload);
    case 'minimal':
      return buildMinimalMessage(payload);
    case 'attachment':
    default:
      return buildAttachmentMessage(payload);
  }
}

// Style 1: Original attachment-based message (cleaned)
function buildAttachmentMessage(payload: WebhookPayload): SlackMessage {
  const { data } = payload;
  const color = deriveColor(data.sender_type, data.platform);
  const attachment: any = {
    color,
    author_name: data.sender.full_name,
    author_icon: data.sender.thumbnail_url,
    text: data.body,
    fields: baseFields(payload)
  };
  maybeAddAttachments(payload, attachment);
  maybeAddReservation(payload, attachment);
  return { text: '', attachments: [attachment] };
}

// Style 2: Blocks layout (richer, modern Slack UI)
function buildBlocksMessage(payload: WebhookPayload): SlackMessage {
  const { data } = payload;
  const headerText = `${data.sender.full_name}`;
  const blocks: any[] = [];
  // Header
  blocks.push({ type: 'header', text: { type: 'plain_text', text: headerText, emoji: true } });
  // Context (sender + platform + source)
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `*Platform:* ${proper(data.platform)}` },
      { type: 'mrkdwn', text: `*Sender:* ${senderDisplay(payload)}` },
      { type: 'mrkdwn', text: `*Source:* ${data.source.replace('_',' ').toUpperCase()}` }
    ]
  });
  // Message body
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: escapeSlack(data.body) || '_(empty message)_' } });
  // IDs row
  const idsParts: string[] = [`_Conv: ${shortId(data.conversation_id)}_`];
  if (data.reservation_id !== data.conversation_id) idsParts.push(`_Res: ${shortId(data.reservation_id)}_`);
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: idsParts.join('  •  ') }] });
  // Attachments list
  if (data.attachments && data.attachments.length) {
    const lines = data.attachments.map(a => `• ${a.type}: ${a.url}`).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Attachments*\n${lines}` } });
  }
  return { text: '', blocks };
}

// Style 3: Minimal single-line summary
function buildMinimalMessage(payload: WebhookPayload): SlackMessage {
  const { data } = payload;
  const parts: string[] = [];
  parts.push(`${proper(data.platform)} ${data.sender_type}`);
  parts.push(`"${truncate(data.body, 80)}"`);
  parts.push(`Conv:${shortId(data.conversation_id)}`);
  if (data.reservation_id !== data.conversation_id) parts.push(`Res:${shortId(data.reservation_id)}`);
  return { text: parts.join(' | ') };
}

// Shared helpers
function deriveColor(senderType: string, platform: string): string {
  if (platform === 'airbnb') return senderType === 'guest' ? '#FF5A5F' : '#00A699';
  return senderType === 'guest' ? '#ff6b6b' : '#4ecdc4';
}

function senderDisplay(payload: WebhookPayload): string {
  const { data } = payload;
  return data.sender_role ? `${data.sender_type} (${data.sender_role})` : data.sender_type;
}

function baseFields(payload: WebhookPayload) {
  const { data } = payload;
  const fields: any[] = [
    { title: 'Sender', value: senderDisplay(payload), short: true },
    { title: 'Platform', value: proper(data.platform), short: true },
    { title: 'Source', value: data.source.replace('_',' ').toUpperCase(), short: true },
    { title: '', value: `_Conv: ${shortId(data.conversation_id)}_`, short: true }
  ];
  return fields;
}

function maybeAddReservation(payload: WebhookPayload, attachment: any) {
  const { data } = payload;
  if (data.reservation_id !== data.conversation_id) {
    attachment.fields.push({ title: '', value: `_Res: ${shortId(data.reservation_id)}_`, short: true });
  }
}

function maybeAddAttachments(payload: WebhookPayload, attachment: any) {
  const { data } = payload;
  if (data.attachments && data.attachments.length > 0) {
    const attachmentInfo = data.attachments.map(att => `📎 ${att.type}: ${att.url}`).join('\n');
    attachment.fields.push({ title: 'Attachments', value: attachmentInfo, short: false });
  }
}

function shortId(id: string): string { return id.substring(0,8) + '...'; }
function proper(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function truncate(s: string, n: number): string { return s.length > n ? s.slice(0,n-1) + '…' : s; }
function escapeSlack(s: string): string { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }