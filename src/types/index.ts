export interface WebhookPayload {
    id: string;
    data: WebhookData;
    action: string;
    created: string;
    version: string;
}

export interface WebhookData {
    platform: string;
    platform_id: number;
    conversation_id: string;
    reservation_id: string;
    content_type: string;
    body: string;
    attachments?: Array<{
        type: string;
        url: string;
    }>;
    sender_type: 'host' | 'guest';
    sender_role: 'host' | 'co-host' | 'teammate' | null;
    sender: {
        first_name: string;
        full_name: string;
        locale: string;
        picture_url: string;
        thumbnail_url: string;
        location: string | null;
    };
    user: {
        id: string;
        email: string;
        name: string;
    };
    created_at: string;
    source: string;
    integration: string;
    sent_reference_id: string;
}

export interface SlackMessage {
    channel?: string; // For Web API
    text: string;
    blocks?: any[];
    attachments?: Array<{
        text?: string;
        color?: string;
        fields?: Array<{
            title: string;
            value: string;
            short?: boolean;
        }>;
        author_name?: string;
        author_icon?: string;
        thumb_url?: string;
        footer?: string;
        ts?: number;
    }>;
}