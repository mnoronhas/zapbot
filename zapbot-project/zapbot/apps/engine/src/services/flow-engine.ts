/**
 * Flow Engine — The bot runtime.
 *
 * Takes an incoming message, finds the current conversation state,
 * executes the current flow node, and produces outgoing messages.
 *
 * This is the brain of ZapBot.
 */

import type { BotFlow, FlowNode, FlowOption } from "@zapbot/flow-schema";
import type { ParsedMessage } from "@zapbot/whatsapp";

// =============================================================================
// Types
// =============================================================================

export type ConversationState = {
  conversationId: string;
  currentNodeId: string | null;
  variables: Record<string, string>;
  status: "active" | "completed" | "handed_off";
};

export type EngineOutput = {
  /** Messages to send to the user */
  messages: OutgoingMessage[];
  /** Updated conversation state */
  state: ConversationState;
  /** Side effects to trigger */
  sideEffects: SideEffect[];
};

export type OutgoingMessage =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: Array<{ id: string; title: string }> }
  | { type: "list"; body: string; buttonText: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> }
  | { type: "template"; templateName: string; languageCode: string; components?: Array<Record<string, unknown>> };

export type SideEffect =
  | { type: "track_event"; eventType: string; nodeId: string; metadata?: Record<string, unknown> }
  | { type: "book_appointment"; data: Record<string, unknown> }
  | { type: "handoff"; conversationId: string }
  | { type: "fetch_availability"; config: Record<string, unknown> };

// =============================================================================
// Engine
// =============================================================================

export class FlowEngine {
  private nodeMap: Map<string, FlowNode>;
  private flow: BotFlow;

  constructor(flow: BotFlow) {
    this.flow = flow;
    this.nodeMap = new Map(flow.nodes.map((n) => [n.id, n]));
  }

  /**
   * Process an incoming message and produce engine output.
   *
   * If state.currentNodeId is null, start from the beginning.
   * Otherwise, use the current node to interpret the user's response,
   * then advance to the next node and produce its output.
   */
  process(message: ParsedMessage, state: ConversationState): EngineOutput {
    const output: EngineOutput = {
      messages: [],
      state: { ...state },
      sideEffects: [],
    };

    // Track conversation start if new
    if (!state.currentNodeId) {
      const startNode = this.nodeMap.get(this.flow.startNodeId);
      if (!startNode) {
        output.messages.push({ type: "text", body: "Desculpe, ocorreu um erro. Tente novamente mais tarde." });
        return output;
      }

      output.sideEffects.push({
        type: "track_event",
        eventType: "conversation_started",
        nodeId: this.flow.startNodeId,
      });

      return this.executeNode(startNode, message, output);
    }

    // Find current node and process user response
    const currentNode = this.nodeMap.get(state.currentNodeId);
    if (!currentNode) {
      output.messages.push({ type: "text", body: "Desculpe, ocorreu um erro. Tente novamente mais tarde." });
      return output;
    }

    // Determine next node based on user's response and current node type
    const nextNodeId = this.resolveNextNode(currentNode, message, output);

    if (!nextNodeId) {
      // Conversation is over or user response was consumed (e.g., appointment selection)
      return output;
    }

    const nextNode = this.nodeMap.get(nextNodeId);
    if (!nextNode) {
      output.messages.push({ type: "text", body: "Desculpe, ocorreu um erro na conversa." });
      return output;
    }

    return this.executeNode(nextNode, message, output);
  }

  /**
   * Execute a node: produce its outgoing messages and set state.
   * If the node auto-advances (message, wait, condition), recursively execute the next.
   */
  private executeNode(node: FlowNode, message: ParsedMessage, output: EngineOutput): EngineOutput {
    output.sideEffects.push({
      type: "track_event",
      eventType: "node_reached",
      nodeId: node.id,
    });

    const content = this.interpolate(node.content, output.state.variables);

    switch (node.type) {
      case "message": {
        output.messages.push({ type: "text", body: content });
        output.state.currentNodeId = node.id;

        // Auto-advance if there's a next node
        if (node.next) {
          const nextNode = this.nodeMap.get(node.next);
          if (nextNode) {
            return this.executeNode(nextNode, message, output);
          }
        }
        // End of conversation
        output.state.status = "completed";
        break;
      }

      case "buttons": {
        if (!node.options) break;
        output.messages.push({
          type: "buttons",
          body: content,
          buttons: node.options.map((o) => ({ id: o.value, title: o.label })),
        });
        output.state.currentNodeId = node.id;
        break;
      }

      case "list": {
        if (!node.sections) break;
        output.messages.push({
          type: "list",
          body: content,
          buttonText: node.listButtonText || "Ver opções",
          sections: node.sections.map((s) => ({
            title: s.title,
            rows: s.items.map((i) => ({ id: i.id, title: i.title, description: i.description })),
          })),
        });
        output.state.currentNodeId = node.id;
        break;
      }

      case "collect": {
        output.messages.push({ type: "text", body: content });
        output.state.currentNodeId = node.id;
        // Wait for user input — next process() call will capture the value
        break;
      }

      case "appointment": {
        output.messages.push({ type: "text", body: content });
        output.sideEffects.push({
          type: "fetch_availability",
          config: node.config || {},
        });
        output.state.currentNodeId = node.id;
        break;
      }

      case "condition": {
        if (!node.condition) break;
        const fieldValue = output.state.variables[node.condition.field];
        const matches = this.evaluateCondition(node.condition.operator, fieldValue, node.condition.value);
        const nextId = matches ? node.condition.thenNext : node.condition.elseNext;
        const nextNode = this.nodeMap.get(nextId);
        if (nextNode) {
          return this.executeNode(nextNode, message, output);
        }
        break;
      }

      case "handoff": {
        output.messages.push({ type: "text", body: content });
        output.state.currentNodeId = node.id;
        output.state.status = "handed_off";
        output.sideEffects.push({ type: "handoff", conversationId: output.state.conversationId });
        break;
      }

      case "wait": {
        // In practice, this would schedule a delayed message
        output.state.currentNodeId = node.id;
        if (node.next) {
          const nextNode = this.nodeMap.get(node.next);
          if (nextNode) {
            // TODO: Actually implement delay
            return this.executeNode(nextNode, message, output);
          }
        }
        break;
      }
    }

    return output;
  }

  /**
   * Determine which node to go to next based on user's response.
   */
  private resolveNextNode(
    currentNode: FlowNode,
    message: ParsedMessage,
    output: EngineOutput
  ): string | null {
    switch (currentNode.type) {
      case "buttons": {
        // Match button click or text input to an option
        const selectedOption = this.matchOption(currentNode.options || [], message);
        if (selectedOption) {
          return selectedOption.next;
        }
        // Invalid selection — re-show buttons
        output.messages.push({
          type: "text",
          body: "Desculpe, não entendi. Por favor, selecione uma das opções.",
        });
        return null;
      }

      case "list": {
        if (!currentNode.sections) return currentNode.next || null;
        for (const section of currentNode.sections) {
          const item = section.items.find(
            (i) => i.id === message.listItemId || i.title.toLowerCase() === message.text.toLowerCase()
          );
          if (item) return item.next;
        }
        output.messages.push({ type: "text", body: "Desculpe, seleção inválida. Tente novamente." });
        return null;
      }

      case "collect": {
        // Store the user's response in variables
        if (currentNode.field) {
          // TODO: Validate based on fieldType
          output.state.variables[currentNode.field] = message.text;
        }
        return currentNode.next || null;
      }

      case "appointment": {
        // User selected a time slot
        // TODO: Handle appointment selection/confirmation flow
        return currentNode.next || null;
      }

      default:
        return currentNode.next || null;
    }
  }

  /**
   * Match user input to a button option.
   */
  private matchOption(options: FlowOption[], message: ParsedMessage): FlowOption | undefined {
    // Direct button reply match
    if (message.type === "button_reply" && message.buttonId) {
      return options.find((o) => o.value === message.buttonId);
    }
    // Text match (fuzzy)
    const normalized = message.text.toLowerCase().trim();
    return options.find(
      (o) =>
        o.label.toLowerCase() === normalized ||
        o.value.toLowerCase() === normalized
    );
  }

  /**
   * Evaluate a condition.
   */
  private evaluateCondition(
    operator: string,
    fieldValue: string | undefined,
    compareValue: string | undefined
  ): boolean {
    switch (operator) {
      case "equals":
        return fieldValue?.toLowerCase() === compareValue?.toLowerCase();
      case "not_equals":
        return fieldValue?.toLowerCase() !== compareValue?.toLowerCase();
      case "contains":
        return fieldValue?.toLowerCase().includes(compareValue?.toLowerCase() || "") || false;
      case "exists":
        return fieldValue !== undefined && fieldValue !== "";
      case "not_exists":
        return fieldValue === undefined || fieldValue === "";
      default:
        return false;
    }
  }

  /**
   * Replace {variable} placeholders in text.
   */
  private interpolate(text: string, variables: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (match, key) => variables[key] || match);
  }
}
