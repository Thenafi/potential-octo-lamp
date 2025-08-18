// This file is the entry point of the Cloudflare Worker. It listens for incoming webhook requests and processes the data to post messages to Slack.

import { WebhookPayload, SlackMessage, HospitableReservationResponse, HospitableProperty } from './types';

// Configuration - Post to specific channel
const SLACK_CHANNEL_ID = 'C08R24HBK7F';
const SLACK_API_URL = 'https://slack.com/api/chat.postMessage';
const HOSPITABLE_API_URL = 'https://public.api.hospitable.com/v2/reservations';

// Environment interface for Cloudflare Workers
interface Env {
  SLACK_BOT_TOKEN: string;
  HOSPITABLE_API_TOKEN: string;
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
  
  // Handle conversation redirect endpoint
  if (url.pathname.startsWith('/conversation/')) {
    const encodedId = url.pathname.split('/conversation/')[1];
    if (encodedId) {
      try {
        const decodedId = decodeId(encodedId);
        const hospitableUrl = `https://my.hospitable.com/inbox/thread/${decodedId}`;
        return Response.redirect(hospitableUrl, 302);
      } catch (error) {
        return new Response('Invalid conversation ID', { status: 400 });
      }
    }
    return new Response('Missing conversation ID', { status: 400 });
  }
  
  // Check if the request is for the /messages endpoint
  if (url.pathname !== '/messages') {
    return new Response('Not Found - Use /messages or /conversation/<id> endpoints', { status: 404 });
  }
  
  if (request.method === 'POST') {
    try {
      const payload: WebhookPayload = await request.json();
  const styleParam = (url.searchParams.get('style') || '').toLowerCase();
  const style: MessageStyle = ['simple','blocks','minimal','attachment'].includes(styleParam) ? styleParam as MessageStyle : 'simple';
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

type MessageStyle = 'simple' | 'attachment' | 'blocks' | 'minimal';

async function fetchPropertyDetails(reservationId: string, env: Env): Promise<HospitableProperty | null> {
  try {
    const response = await fetch(`${HOSPITABLE_API_URL}/${reservationId}?include=properties`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.HOSPITABLE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch property details: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: HospitableReservationResponse = await response.json();
    
    // Return the first property if available
    if (data.data.properties && data.data.properties.length > 0) {
      return data.data.properties[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching property details:', error);
    return null;
  }
}

async function postToSlack(payload: WebhookPayload, env: Env, style: MessageStyle): Promise<void> {
  // Fetch property details using the reservation_id from the webhook payload
  const propertyDetails = await fetchPropertyDetails(payload.data.reservation_id, env);
  
  const message = formatSlackMessage(payload, style, propertyDetails);
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

function formatSlackMessage(payload: WebhookPayload, style: MessageStyle, propertyDetails: HospitableProperty | null = null): SlackMessage {
  switch (style) {
    case 'blocks':
      return buildBlocksMessage(payload, propertyDetails);
    case 'minimal':
      return buildMinimalMessage(payload, propertyDetails);
    case 'attachment':
      return buildAttachmentMessage(payload, propertyDetails);
    case 'simple':
    default:
      return buildSimpleMessage(payload, propertyDetails);
  }
}

// New default: simple blocks-based message without side color, message inside code block, sequential IDs
function buildSimpleMessage(payload: WebhookPayload, propertyDetails: HospitableProperty | null = null): SlackMessage {
  const { data } = payload;
  const blocks: any[] = [];
  
  // Main header: Sender name - Property name
  let headerText = `*${escapeSlack(data.sender.full_name)}*`;
  if (propertyDetails) {
    headerText += ` - ${escapeSlack(propertyDetails.name)}`;
  }
  
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: headerText }
  });

  // Body as code block (fallback if empty)
  const body = data.body && data.body.trim().length ? data.body : '(empty message)';
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '```' + escapeSlack(body) + '```' }
  });

  // Sender context with image after the message
  const contextElements: any[] = [];
  
  // Add sender image first if available
  if (data.sender.thumbnail_url) {
    contextElements.push({
      type: 'image',
      image_url: data.sender.thumbnail_url,
      alt_text: data.sender.full_name
    });
  }
  
  // Add sender details
  contextElements.push({ type: 'mrkdwn', text: `${senderDisplay(payload)} (${proper(data.platform)})` });
  
  blocks.push({
    type: 'context',
    elements: contextElements
  });

  // Metadata lines sequential (no columns) - smaller text
  let metaLines: string[] = [];
  metaLines.push(`Source: ${data.source.replace('_',' ').toUpperCase()}`);
  metaLines.push(`Conversation: ${encodeId(data.conversation_id)}`);
  if (data.reservation_id !== data.conversation_id) metaLines.push(`Reservation: ${encodeId(data.reservation_id)}`);
  
  // Add property details to metadata if available
  if (propertyDetails) {
    metaLines.push(`${escapeSlack(propertyDetails.public_name)} • ID: ${propertyDetails.id}`);
  }
  
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: metaLines.join('\n') }] });
  // Conversation link section
  const encodedId = encodeId(data.conversation_id);
  const workerUrl = `https://potential-octo-lamp.chest.workers.dev/conversation/${encodedId}`;
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `:link: <${workerUrl}|Open in Hospitable Inbox>` } });
  // Attachments (if any) each on its own line after a title
  if (data.attachments && data.attachments.length) {
    const lines = data.attachments.map(a => `• ${a.type}: ${formatUrlAsHyperlink(a.url)}`).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Attachments*\n${lines}` } });
  }
  return { text: '', blocks };
}

// Style 1: Original attachment-based message (cleaned)
function buildAttachmentMessage(payload: WebhookPayload, propertyDetails: HospitableProperty | null = null): SlackMessage {
  const { data } = payload;
  const color = deriveColor(data.sender_type, data.platform);
  const attachment: any = {
    color,
    author_name: data.sender.full_name,
    text: data.body,
    fields: baseFields(payload, propertyDetails)
  };
  
  // Add author icon only if thumbnail_url exists
  if (data.sender.thumbnail_url) {
    attachment.author_icon = data.sender.thumbnail_url;
  }
  maybeAddAttachments(payload, attachment);
  maybeAddReservation(payload, attachment);
  // Add conversation link as a field
  const encodedId = encodeId(data.conversation_id);
  const workerUrl = `https://potential-octo-lamp.chest.workers.dev/conversation/${encodedId}`;
  attachment.fields.push({ title: '', value: `:link: <${workerUrl}|Open in Hospitable Inbox>`, short: false });
  return { text: '', attachments: [attachment] };
}

// Style 2: Blocks layout (richer, modern Slack UI)
function buildBlocksMessage(payload: WebhookPayload, propertyDetails: HospitableProperty | null = null): SlackMessage {
  const { data } = payload;
  const blocks: any[] = [];
  
  // Header context block with optional image
  const headerElements: any[] = [];
  
  // Add sender image first if available
  if (data.sender.thumbnail_url) {
    headerElements.push({
      type: 'image',
      image_url: data.sender.thumbnail_url,
      alt_text: data.sender.full_name
    });
  }
  
  // Add small sender details in context
  headerElements.push({ type: 'mrkdwn', text: `${senderDisplay(payload)} (${proper(data.platform)})` });
  
  blocks.push({
    type: 'context',
    elements: headerElements
  });

  // Sender name as main section (like property)
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `👤 *${data.sender.full_name}*` }
  });

  // Property information (if available)
  if (propertyDetails) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🏠 *Property:* ${escapeSlack(propertyDetails.public_name)} (ID: \`${propertyDetails.id}\`)` }
    });
  }

  // Context (sender + platform + source) - smaller text
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
  // IDs row - smaller text
  const idsParts: string[] = [`_Conv: ${encodeId(data.conversation_id)}_`];
  if (data.reservation_id !== data.conversation_id) idsParts.push(`_Res: ${encodeId(data.reservation_id)}_`);
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: idsParts.join('  •  ') }] });
  // Conversation link section
  const encodedId = encodeId(data.conversation_id);
  const workerUrl = `https://potential-octo-lamp.chest.workers.dev/conversation/${encodedId}`;
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `:link: <${workerUrl}|Open in Hospitable Inbox>` } });
  // Attachments list
  if (data.attachments && data.attachments.length) {
    const lines = data.attachments.map(a => `• ${a.type}: ${formatUrlAsHyperlink(a.url)}`).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Attachments*\n${lines}` } });
  }
  return { text: '', blocks };
}

// Style 3: Minimal single-line summary
function buildMinimalMessage(payload: WebhookPayload, propertyDetails: HospitableProperty | null = null): SlackMessage {
  const { data } = payload;
  const parts: string[] = [];
  
  // Add sender image link only if thumbnail_url exists
  if (data.sender.thumbnail_url) {
    parts.push(`:bust_in_silhouette: <${data.sender.thumbnail_url}|${data.sender.full_name}>`);
  } else {
    parts.push(`:bust_in_silhouette: ${data.sender.full_name}`);
  }
  
  parts.push(`${proper(data.platform)} ${data.sender_type}`);

  // Add property name and ID if available
  if (propertyDetails) {
    parts.push(`🏠 ${propertyDetails.public_name} (${propertyDetails.id})`);
  }

  parts.push(`"${truncate(data.body, 80)}"`);
  parts.push(`Conv:${encodeId(data.conversation_id)}`);
  if (data.reservation_id !== data.conversation_id) parts.push(`Res:${encodeId(data.reservation_id)}`);
  const encodedId = encodeId(data.conversation_id);
  const workerUrl = `https://potential-octo-lamp.chest.workers.dev/conversation/${encodedId}`;
  parts.push(`:link: <${workerUrl}|Open in Hospitable Inbox>`);
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

function baseFields(payload: WebhookPayload, propertyDetails: HospitableProperty | null = null) {
  const { data } = payload;
  const fields: any[] = [
    { title: 'Sender', value: senderDisplay(payload), short: true },
    { title: 'Platform', value: proper(data.platform), short: true },
    { title: 'Source', value: data.source.replace('_',' ').toUpperCase(), short: true },
    { title: '', value: `_Conv: ${encodeId(data.conversation_id)}_`, short: true }
  ];

  // Add property field if available
  if (propertyDetails) {
    fields.push({ title: 'Property', value: `${propertyDetails.public_name} (ID: ${propertyDetails.id})`, short: true });
  }

  return fields;
}

function maybeAddReservation(payload: WebhookPayload, attachment: any) {
  const { data } = payload;
  if (data.reservation_id !== data.conversation_id) {
    attachment.fields.push({ title: '', value: `_Res: ${encodeId(data.reservation_id)}_`, short: true });
  }
}

function maybeAddAttachments(payload: WebhookPayload, attachment: any) {
  const { data } = payload;
  if (data.attachments && data.attachments.length > 0) {
    const attachmentInfo = data.attachments.map(att => `📎 ${att.type}: ${formatUrlAsHyperlink(att.url)}`).join('\n');
    attachment.fields.push({ title: 'Attachments', value: attachmentInfo, short: false });
  }
}

// Helper function to format long URLs as hyperlinks
function formatUrlAsHyperlink(url: string): string {
  // If URL is longer than 50 characters, create a hyperlink with shortened text
  if (url.length > 50) {
    const filename = url.split('/').pop() || 'Link';
    return `<${url}|${filename}>`;
  }
  return url;
}

// Encode a UUID as base64 (URL-safe, no padding)
function encodeId(id: string): string {
  // Polyfill for Buffer in Cloudflare Workers
  const b64 = btoa(unescape(encodeURIComponent(id)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Decode a base64-encoded UUID back to original
function decodeId(encodedId: string): string {
  // Reverse URL-safe base64 to standard base64
  let b64 = encodedId.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (b64.length % 4) {
    b64 += '=';
  }
  // Decode from base64
  return decodeURIComponent(escape(atob(b64)));
}
function proper(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function truncate(s: string, n: number): string { return s.length > n ? s.slice(0,n-1) + '…' : s; }
function escapeSlack(s: string): string { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }