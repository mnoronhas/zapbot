import crypto from "node:crypto";

// =============================================================================
// Types — WhatsApp Cloud API
// =============================================================================

export type WhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  appSecret?: string; // For webhook signature verification
  apiVersion?: string;
};

export type SendMessageResult = {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
};

// Incoming webhook types
export type WebhookEntry = {
  id: string;
  changes: Array<{
    value: {
      messaging_product: "whatsapp";
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: Array<IncomingMessage>;
      statuses?: Array<MessageStatus>;
    };
    field: "messages";
  }>;
};

export type IncomingMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "interactive" | "button" | "image" | "document" | "audio" | "video" | "location" | "contacts";
  text?: { body: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
};

export type MessageStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
};

// =============================================================================
// Client
// =============================================================================

export class WhatsAppClient {
  private baseUrl: string;
  private config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    const version = config.apiVersion || "v21.0";
    this.baseUrl = `https://graph.facebook.com/${version}/${config.phoneNumberId}`;
  }

  // ---------------------------------------------------------------------------
  // Send messages
  // ---------------------------------------------------------------------------

  /** Send a plain text message */
  async sendText(to: string, body: string): Promise<SendMessageResult> {
    return this.send(to, { type: "text", text: { preview_url: false, body } });
  }

  /** Send interactive buttons (max 3) */
  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<SendMessageResult> {
    if (buttons.length > 3) throw new Error("WhatsApp allows max 3 buttons");
    return this.send(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  /** Send interactive list */
  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>
  ): Promise<SendMessageResult> {
    return this.send(to, {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: { button: buttonText.slice(0, 20), sections },
      },
    });
  }

  /** Send a message template (for 24h+ window, e.g., reminders) */
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: Array<Record<string, unknown>>
  ): Promise<SendMessageResult> {
    return this.send(to, {
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    });
  }

  /** Mark a message as read */
  async markAsRead(messageId: string): Promise<void> {
    await this.request("/messages", {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  }

  // ---------------------------------------------------------------------------
  // Webhook verification
  // ---------------------------------------------------------------------------

  /**
   * Verify webhook signature from Meta.
   * Returns true if signature is valid.
   */
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!this.config.appSecret) {
      console.warn("WhatsApp appSecret not configured — skipping signature verification");
      return true;
    }
    const expectedSignature = crypto
      .createHmac("sha256", this.config.appSecret)
      .update(rawBody)
      .digest("hex");
    return `sha256=${expectedSignature}` === signature;
  }

  /**
   * Handle Meta webhook verification challenge (GET request).
   */
  static handleVerifyChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    expectedToken: string
  ): { status: number; body: string } {
    if (mode === "subscribe" && token === expectedToken && challenge) {
      return { status: 200, body: challenge };
    }
    return { status: 403, body: "Forbidden" };
  }

  // ---------------------------------------------------------------------------
  // Parse incoming messages
  // ---------------------------------------------------------------------------

  /**
   * Extract the user's response from an incoming message.
   * Returns null for status updates or unsupported message types.
   */
  static parseIncomingMessage(message: IncomingMessage): ParsedMessage | null {
    switch (message.type) {
      case "text":
        return {
          type: "text",
          from: message.from,
          messageId: message.id,
          text: message.text?.body || "",
          timestamp: message.timestamp,
        };

      case "interactive":
        if (message.interactive?.type === "button_reply") {
          return {
            type: "button_reply",
            from: message.from,
            messageId: message.id,
            text: message.interactive.button_reply?.title || "",
            buttonId: message.interactive.button_reply?.id || "",
            timestamp: message.timestamp,
          };
        }
        if (message.interactive?.type === "list_reply") {
          return {
            type: "list_reply",
            from: message.from,
            messageId: message.id,
            text: message.interactive.list_reply?.title || "",
            listItemId: message.interactive.list_reply?.id || "",
            timestamp: message.timestamp,
          };
        }
        return null;

      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async send(to: string, message: Record<string, unknown>): Promise<SendMessageResult> {
    const response = await this.request("/messages", {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        ...message,
      }),
    });
    return response as SendMessageResult;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.accessToken}`,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new WhatsAppApiError(
        `WhatsApp API error: ${response.status}`,
        response.status,
        error
      );
    }

    return response.json();
  }
}

// =============================================================================
// Parsed message type
// =============================================================================

export type ParsedMessage = {
  type: "text" | "button_reply" | "list_reply";
  from: string;
  messageId: string;
  text: string;
  buttonId?: string;
  listItemId?: string;
  timestamp: string;
};

// =============================================================================
// Error class
// =============================================================================

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details: unknown
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}
