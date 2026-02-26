// =============================================================================
// Types — Evolution API
// =============================================================================

export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
};

export type EvolutionWebhookPayload = {
  event: string;
  instance: string;
  data: EvolutionMessageData;
};

export type EvolutionMessageData = {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    buttonsResponseMessage?: { selectedButtonId: string; selectedDisplayText?: string };
    listResponseMessage?: { singleSelectReply?: { selectedRowId: string }; title?: string };
  };
  messageTimestamp?: number | string;
};

export type EvolutionConnectionData = {
  instance: string;
  state: "open" | "close" | "connecting";
  statusReason?: number;
};

export type EvolutionInstanceInfo = {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
    owner?: string;
    profileName?: string;
    profilePictureUrl?: string;
  };
};

export type SendMessageResult = {
  key: { remoteJid: string; fromMe: boolean; id: string };
  message: Record<string, unknown>;
  messageTimestamp: number;
  status: string;
};

// =============================================================================
// Parsed message type (unchanged — flow engine depends on this)
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
// Client
// =============================================================================

export class EvolutionClient {
  private baseUrl: string;
  private apiKey: string;
  private instanceName: string;

  constructor(config: EvolutionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.instanceName = config.instanceName;
  }

  // ---------------------------------------------------------------------------
  // Send messages
  // ---------------------------------------------------------------------------

  async sendText(to: string, body: string): Promise<SendMessageResult> {
    return this.request(`/message/sendText/${this.instanceName}`, {
      method: "POST",
      body: JSON.stringify({ number: to, text: body }),
    }) as Promise<SendMessageResult>;
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<SendMessageResult> {
    if (buttons.length > 3) throw new Error("WhatsApp allows max 3 buttons");
    return this.request(`/message/sendButtons/${this.instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        number: to,
        title: "",
        description: body,
        footer: "",
        buttons: buttons.map((b) => ({
          type: "reply",
          displayText: b.title.slice(0, 20),
          id: b.id,
        })),
      }),
    }) as Promise<SendMessageResult>;
  }

  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<SendMessageResult> {
    return this.request(`/message/sendList/${this.instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        number: to,
        title: "",
        description: body,
        buttonText: buttonText.slice(0, 20),
        footerText: "",
        sections,
      }),
    }) as Promise<SendMessageResult>;
  }

  async sendTemplate(
    _to: string,
    _templateName: string,
    _languageCode: string,
    _components?: Array<Record<string, unknown>>,
  ): Promise<SendMessageResult | null> {
    // Evolution API uses Baileys (unofficial), no template support needed.
    // Messages can be sent anytime without the 24h window restriction.
    console.warn("sendTemplate called but Evolution API does not require templates — skipping");
    return null;
  }

  async markAsRead(_messageId: string): Promise<void> {
    // No-op for MVP
  }

  // ---------------------------------------------------------------------------
  // Instance management
  // ---------------------------------------------------------------------------

  async createInstance(
    instanceName: string,
    webhookUrl: string,
  ): Promise<{ instance: { instanceName: string; status: string } }> {
    const result = await this.request("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        rejectCall: true,
        webhookByEvents: true,
        webhookBase64: false,
        webhook: {
          url: webhookUrl,
          byEvents: true,
          base64: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }),
    });
    return result as { instance: { instanceName: string; status: string } };
  }

  async connectInstance(): Promise<{ pairingCode?: string; code?: string; base64?: string }> {
    const result = await this.request(`/instance/connect/${this.instanceName}`, {
      method: "GET",
    });
    return result as { pairingCode?: string; code?: string; base64?: string };
  }

  async fetchInstance(): Promise<EvolutionInstanceInfo | null> {
    try {
      const result = await this.request(
        `/instance/fetchInstances?instanceName=${this.instanceName}`,
        { method: "GET" },
      );
      // API may return an array or a single object
      if (Array.isArray(result)) {
        return (result[0] as EvolutionInstanceInfo) ?? null;
      }
      return result as EvolutionInstanceInfo;
    } catch {
      return null;
    }
  }

  async deleteInstance(): Promise<void> {
    await this.request(`/instance/delete/${this.instanceName}`, {
      method: "DELETE",
    });
  }

  async setWebhook(
    url: string,
    events: string[] = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
  ): Promise<void> {
    await this.request(`/webhook/set/${this.instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        url,
        webhookByEvents: true,
        webhookBase64: false,
        events,
      }),
    });
  }

  // ---------------------------------------------------------------------------
  // Parse incoming messages
  // ---------------------------------------------------------------------------

  static parseIncomingMessage(data: EvolutionMessageData): ParsedMessage | null {
    if (!data.key || !data.message) return null;

    const from = data.key.remoteJid.replace(/@s\.whatsapp\.net$/, "");
    const messageId = data.key.id;
    const timestamp = String(data.messageTimestamp ?? Math.floor(Date.now() / 1000));

    // Text message
    const textContent =
      data.message.conversation ?? data.message.extendedTextMessage?.text;
    if (textContent !== undefined) {
      return {
        type: "text",
        from,
        messageId,
        text: textContent,
        timestamp,
      };
    }

    // Button reply
    const buttonReply = data.message.buttonsResponseMessage;
    if (buttonReply?.selectedButtonId) {
      return {
        type: "button_reply",
        from,
        messageId,
        text: buttonReply.selectedDisplayText ?? "",
        buttonId: buttonReply.selectedButtonId,
        timestamp,
      };
    }

    // List reply
    const listReply = data.message.listResponseMessage;
    if (listReply?.singleSelectReply?.selectedRowId) {
      return {
        type: "list_reply",
        from,
        messageId,
        text: listReply.title ?? "",
        listItemId: listReply.singleSelectReply.selectedRowId,
        timestamp,
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: this.apiKey,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new EvolutionApiError(
        `Evolution API error: ${response.status}`,
        response.status,
        error,
      );
    }

    return response.json();
  }
}

// =============================================================================
// Error class
// =============================================================================

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details: unknown,
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}
