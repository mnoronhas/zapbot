import { z } from "zod";

// =============================================================================
// Node Types
// =============================================================================

export const NodeType = z.enum([
  "message",
  "buttons",
  "list",
  "collect",
  "appointment",
  "condition",
  "handoff",
  "wait",
]);
export type NodeType = z.infer<typeof NodeType>;

// =============================================================================
// Sub-schemas
// =============================================================================

export const FlowOption = z.object({
  label: z.string().min(1).max(20), // WhatsApp button text limit
  value: z.string().min(1),
  next: z.string().min(1),
});
export type FlowOption = z.infer<typeof FlowOption>;

export const ListSection = z.object({
  title: z.string().max(24),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string().max(24),
      description: z.string().max(72).optional(),
      next: z.string(),
    })
  ),
});
export type ListSection = z.infer<typeof ListSection>;

export const FieldType = z.enum(["text", "phone", "cpf", "date", "email", "number"]);
export type FieldType = z.infer<typeof FieldType>;

export const AppointmentConfig = z.object({
  durationRules: z.record(z.string(), z.number().min(5).max(480)),
  sourceField: z.string(),
  bufferMinutes: z.number().min(0).max(120).default(15),
  maxAdvanceDays: z.number().min(1).max(365).default(60),
  professionalSelection: z.enum(["manual", "auto"]).default("manual"),
});
export type AppointmentConfig = z.infer<typeof AppointmentConfig>;

export const ConditionOperator = z.enum(["equals", "not_equals", "contains", "exists", "not_exists"]);
export type ConditionOperator = z.infer<typeof ConditionOperator>;

export const ConditionRule = z.object({
  field: z.string(),
  operator: ConditionOperator,
  value: z.string().optional(),
  thenNext: z.string(),
  elseNext: z.string(),
});
export type ConditionRule = z.infer<typeof ConditionRule>;

// =============================================================================
// Flow Node
// =============================================================================

export const FlowNode = z
  .object({
    id: z.string().min(1).max(64),
    type: NodeType,
    content: z.string().max(4096), // WhatsApp max message body
    next: z.string().optional(),
    // Buttons type
    options: z.array(FlowOption).max(3).optional(), // WhatsApp max 3 buttons
    // List type
    listButtonText: z.string().max(20).optional(),
    sections: z.array(ListSection).optional(),
    // Collect type
    field: z.string().max(64).optional(),
    fieldType: FieldType.optional(),
    fieldLabel: z.string().optional(),
    // Appointment type
    config: AppointmentConfig.optional(),
    // Condition type
    condition: ConditionRule.optional(),
    // Wait type
    waitSeconds: z.number().min(1).max(300).optional(),
    // Metadata for editor (positions, colors, etc.)
    metadata: z.record(z.unknown()).optional(),
  })
  .refine(
    (node) => {
      // Buttons must have options
      if (node.type === "buttons" && (!node.options || node.options.length < 1)) return false;
      // List must have sections
      if (node.type === "list" && (!node.sections || node.sections.length < 1)) return false;
      // Collect must have field
      if (node.type === "collect" && !node.field) return false;
      // Appointment must have config
      if (node.type === "appointment" && !node.config) return false;
      // Condition must have condition
      if (node.type === "condition" && !node.condition) return false;
      // Wait must have waitSeconds
      if (node.type === "wait" && !node.waitSeconds) return false;
      return true;
    },
    { message: "Node is missing required fields for its type" }
  );
export type FlowNode = z.infer<typeof FlowNode>;

// =============================================================================
// Bot Flow (complete document)
// =============================================================================

export const BotFlow = z.object({
  version: z.number().int().min(1).default(1),
  startNodeId: z.string(),
  nodes: z.array(FlowNode).min(1),
});
export type BotFlow = z.infer<typeof BotFlow>;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateFlow(flow: unknown): {
  success: boolean;
  data?: BotFlow;
  errors?: z.ZodError;
} {
  const result = BotFlow.safeParse(flow);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Check for structural issues in a flow:
 * - Unreachable nodes
 * - Dead-end nodes (no next and not handoff/appointment terminal)
 * - Missing node references
 * - Duplicate IDs
 */
export function analyzeFlow(flow: BotFlow): FlowAnalysis {
  const nodeMap = new Map(flow.nodes.map((n) => [n.id, n]));
  const issues: FlowIssue[] = [];

  // Check for duplicate IDs
  const idCounts = new Map<string, number>();
  for (const node of flow.nodes) {
    idCounts.set(node.id, (idCounts.get(node.id) || 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      issues.push({ type: "error", nodeId: id, message: `ID duplicado: "${id}" aparece ${count} vezes` });
    }
  }

  // Check start node exists
  if (!nodeMap.has(flow.startNodeId)) {
    issues.push({ type: "error", nodeId: flow.startNodeId, message: "Nó inicial não encontrado" });
  }

  // Check references and dead ends
  const referencedIds = new Set<string>([flow.startNodeId]);

  for (const node of flow.nodes) {
    const allNextIds: string[] = [];

    if (node.next) allNextIds.push(node.next);
    if (node.options) node.options.forEach((o) => allNextIds.push(o.next));
    if (node.sections) node.sections.forEach((s) => s.items.forEach((i) => allNextIds.push(i.next)));
    if (node.condition) {
      allNextIds.push(node.condition.thenNext);
      allNextIds.push(node.condition.elseNext);
    }

    // Check all referenced nodes exist
    for (const nextId of allNextIds) {
      referencedIds.add(nextId);
      if (!nodeMap.has(nextId)) {
        issues.push({
          type: "error",
          nodeId: node.id,
          message: `Referência para nó inexistente: "${nextId}"`,
        });
      }
    }

    // Check for dead ends (nodes with no outgoing connection)
    const terminalTypes: NodeType[] = ["handoff"];
    if (allNextIds.length === 0 && !terminalTypes.includes(node.type)) {
      // Appointment nodes can be terminal if they're the last step
      if (node.type !== "appointment" || !node.next) {
        issues.push({
          type: "warning",
          nodeId: node.id,
          message: "Nó sem saída — a conversa termina aqui",
        });
      }
    }
  }

  // Check for unreachable nodes
  for (const node of flow.nodes) {
    if (!referencedIds.has(node.id)) {
      issues.push({
        type: "warning",
        nodeId: node.id,
        message: "Nó inalcançável — nenhum outro nó leva até ele",
      });
    }
  }

  return {
    isValid: !issues.some((i) => i.type === "error"),
    issues,
    stats: {
      totalNodes: flow.nodes.length,
      nodeTypes: Object.fromEntries(
        Array.from(new Set(flow.nodes.map((n) => n.type))).map((t) => [
          t,
          flow.nodes.filter((n) => n.type === t).length,
        ])
      ),
    },
  };
}

export type FlowIssue = {
  type: "error" | "warning";
  nodeId: string;
  message: string;
};

export type FlowAnalysis = {
  isValid: boolean;
  issues: FlowIssue[];
  stats: {
    totalNodes: number;
    nodeTypes: Record<string, number>;
  };
};

// =============================================================================
// Template Factory
// =============================================================================

/**
 * Generate the default clinic appointment bot template
 */
export function createClinicTemplate(businessName: string): BotFlow {
  return {
    version: 1,
    startNodeId: "welcome",
    nodes: [
      {
        id: "welcome",
        type: "message",
        content: `Olá! Bem-vindo(a) à ${businessName} 👋\nComo posso ajudar?`,
        next: "main_menu",
      },
      {
        id: "main_menu",
        type: "buttons",
        content: "Escolha uma opção:",
        options: [
          { label: "📅 Agendar consulta", value: "schedule", next: "collect_name" },
          { label: "📋 Informações", value: "info", next: "info_message" },
          { label: "👤 Falar com atendente", value: "human", next: "handoff_human" },
        ],
      },
      {
        id: "collect_name",
        type: "collect",
        content: "Qual é o seu nome completo?",
        field: "patient_name",
        fieldType: "text",
        fieldLabel: "Nome do Paciente",
        next: "collect_type",
      },
      {
        id: "collect_type",
        type: "buttons",
        content: "Obrigado, {patient_name}! É sua primeira consulta ou retorno?",
        options: [
          { label: "Primeira consulta", value: "first", next: "appointment_booking" },
          { label: "Retorno", value: "return", next: "appointment_booking" },
        ],
      },
      {
        id: "appointment_booking",
        type: "appointment",
        content: "Vou verificar os horários disponíveis para você...",
        config: {
          durationRules: { first: 90, return: 60 },
          sourceField: "visit_type",
          bufferMinutes: 15,
          maxAdvanceDays: 60,
          professionalSelection: "manual",
        },
        next: "appointment_confirm",
      },
      {
        id: "appointment_confirm",
        type: "message",
        content:
          "✅ Consulta agendada com sucesso!\n\n📅 {appointment_date}\n⏰ {appointment_time}\n👨‍⚕️ {professional_name}\n\nVocê receberá um lembrete 24h antes.\nPara cancelar, digite \"cancelar\".",
      },
      {
        id: "info_message",
        type: "message",
        content: `📍 ${businessName}\n📞 Telefone: (11) 0000-0000\n🕐 Horário: Seg-Sex 08:00-18:00\n📧 contato@clinica.com.br`,
        next: "info_back",
      },
      {
        id: "info_back",
        type: "buttons",
        content: "Posso ajudar com mais alguma coisa?",
        options: [
          { label: "📅 Agendar consulta", value: "schedule", next: "collect_name" },
          { label: "👋 Encerrar", value: "end", next: "goodbye" },
        ],
      },
      {
        id: "goodbye",
        type: "message",
        content: "Obrigado pelo contato! Até logo 👋",
      },
      {
        id: "handoff_human",
        type: "handoff",
        content: "Um momento, vou transferir você para nosso atendimento. Por favor, aguarde.",
      },
    ],
  };
}
