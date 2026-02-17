import { useState, useCallback, useRef, useEffect } from "react";

const BRAND = {
  green: "#25D366",
  greenDark: "#128C7E",
  teal: "#075E54",
  chatBg: "#ECE5DD",
  bubbleOut: "#DCF8C6",
  bubbleIn: "#FFFFFF",
  dark: "#1A1A2E",
  darker: "#111122",
  surface: "#1E1E36",
  surfaceLight: "#2A2A4A",
  accent: "#25D366",
  textPrimary: "#F0F0F5",
  textSecondary: "#9999BB",
  border: "#333355",
};

const BLOCK_TYPES = [
  { type: "message", label: "Mensagem", icon: "💬", color: "#3B82F6", desc: "Enviar mensagem de texto" },
  { type: "buttons", label: "Botões", icon: "🔘", color: "#8B5CF6", desc: "Opções com botões" },
  { type: "collect", label: "Coletar Dado", icon: "📝", color: "#F59E0B", desc: "Pedir informação" },
  { type: "appointment", label: "Agendar", icon: "📅", color: "#10B981", desc: "Agendamento de consulta" },
  { type: "condition", label: "Condição", icon: "🔀", color: "#EC4899", desc: "Se... então..." },
  { type: "handoff", label: "Transferir", icon: "👤", color: "#EF4444", desc: "Falar com humano" },
];

const DEFAULT_FLOW = [
  { id: "1", type: "message", content: "Olá! Bem-vindo(a) à Clínica Exemplo 👋\nComo posso ajudar?" },
  { id: "2", type: "buttons", content: "Escolha uma opção:", options: [
    { label: "📅 Agendar consulta", value: "schedule" },
    { label: "📋 Informações", value: "info" },
    { label: "👤 Falar com atendente", value: "human" },
  ]},
  { id: "3", type: "collect", content: "Qual é o seu nome completo?", field: "nome_paciente", fieldLabel: "Nome do Paciente" },
  { id: "4", type: "buttons", content: "Obrigado, {nome_paciente}! É sua primeira consulta ou retorno?", options: [
    { label: "Primeira consulta", value: "first" },
    { label: "Retorno", value: "return" },
  ]},
  { id: "5", type: "appointment", content: "Vou verificar os horários disponíveis...", config: { first: 90, return: 60 } },
  { id: "6", type: "message", content: "✅ Consulta agendada com sucesso!\n\n📅 {data_consulta}\n⏰ {horario}\n👨‍⚕️ Dr. Silva\n\nVocê receberá um lembrete 24h antes. Até lá!" },
];

// ============ PHONE SIMULATOR ============
function PhoneSimulator({ flow, onReset }) {
  const [messages, setMessages] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [started, setStarted] = useState(false);
  const [vars, setVars] = useState({});
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isTyping]);

  const replaceVars = (text) => {
    let result = text;
    Object.entries(vars).forEach(([k, v]) => { result = result.replace(new RegExp(`\\{${k}\\}`, "g"), v); });
    return result;
  };

  const addBotMessage = useCallback((node, newVars = vars) => {
    setIsTyping(true);
    const delay = 600 + Math.random() * 800;
    setTimeout(() => {
      setIsTyping(false);
      let content = node.content;
      Object.entries(newVars).forEach(([k, v]) => { content = content.replace(new RegExp(`\\{${k}\\}`, "g"), v); });

      if (node.type === "appointment") {
        setMessages(prev => [...prev,
          { from: "bot", text: content, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) },
          { from: "bot", text: "📅 Horários disponíveis:\n\n🟢 Seg 17/02 — 09:00, 10:30, 14:00\n🟢 Ter 18/02 — 08:00, 11:00, 15:30\n🟢 Qua 19/02 — 09:00, 14:00",
            time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            buttons: [{ label: "Seg 09:00" }, { label: "Seg 10:30" }, { label: "Ter 08:00" }]
          },
        ]);
      } else {
        setMessages(prev => [...prev, {
          from: "bot",
          text: content,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          buttons: node.options?.map(o => ({ label: o.label })),
          isCollect: node.type === "collect",
        }]);
      }
    }, delay);
  }, [vars]);

  const startConversation = () => {
    setStarted(true);
    setMessages([]);
    setCurrentIdx(0);
    setVars({});
    if (flow.length > 0) addBotMessage(flow[0], {});
  };

  const handleUserResponse = (text) => {
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setMessages(prev => [...prev, { from: "user", text, time }]);

    const currentNode = flow[currentIdx];
    let newVars = { ...vars };
    if (currentNode?.type === "collect" && currentNode.field) {
      newVars[currentNode.field] = text;
      setVars(newVars);
    }
    if (currentNode?.type === "appointment") {
      newVars["data_consulta"] = "Seg 17/02/2026";
      newVars["horario"] = "09:00";
      setVars(newVars);
    }

    const nextIdx = currentIdx + 1;
    if (nextIdx < flow.length) {
      setCurrentIdx(nextIdx);
      const nextNode = flow[nextIdx];
      if (nextNode.type === "handoff") {
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          setMessages(prev => [...prev, { from: "system", text: "🔄 Transferindo para um atendente..." }]);
        }, 500);
      } else {
        addBotMessage(nextNode, newVars);
      }
    }
  };

  const handleReset = () => {
    setMessages([]);
    setCurrentIdx(0);
    setStarted(false);
    setVars({});
    setIsTyping(false);
    setInputValue("");
    onReset?.();
  };

  return (
    <div style={{ width: 340, minWidth: 340, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{
        width: 320, borderRadius: 32, overflow: "hidden",
        background: "#000", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        border: "3px solid #333",
      }}>
        {/* Phone notch */}
        <div style={{ height: 28, background: "#000", display: "flex", justifyContent: "center", alignItems: "end", paddingBottom: 4 }}>
          <div style={{ width: 80, height: 6, borderRadius: 3, background: "#222" }} />
        </div>
        {/* WhatsApp header */}
        <div style={{
          background: BRAND.teal, padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>←</div>
          <div style={{
            width: 32, height: 32, borderRadius: 16, background: BRAND.greenDark,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: "white", fontWeight: 600,
          }}>CE</div>
          <div>
            <div style={{ color: "white", fontSize: 13, fontWeight: 600 }}>Clínica Exemplo</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>online</div>
          </div>
        </div>
        {/* Chat area */}
        <div ref={chatRef} style={{
          height: 400, background: BRAND.chatBg, padding: "8px 10px",
          overflowY: "auto", backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%23d4cfc6\" fill-opacity=\"0.15\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')",
        }}>
          {!started ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
              <div style={{ fontSize: 48 }}>🤖</div>
              <div style={{ color: "#666", fontSize: 13, textAlign: "center", lineHeight: 1.5 }}>
                Clique para simular uma<br/>conversa com seu bot
              </div>
              <button onClick={startConversation} style={{
                background: BRAND.green, color: "white", border: "none", borderRadius: 20,
                padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                ▶ Iniciar Teste
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {messages.map((msg, i) => {
                if (msg.from === "system") {
                  return (
                    <div key={i} style={{ textAlign: "center", margin: "8px 0" }}>
                      <span style={{
                        background: "rgba(0,0,0,0.1)", borderRadius: 8, padding: "4px 12px",
                        fontSize: 11, color: "#666",
                      }}>{msg.text}</span>
                    </div>
                  );
                }
                const isBot = msg.from === "bot";
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isBot ? "flex-start" : "flex-end", marginBottom: 2 }}>
                    <div style={{
                      maxWidth: "82%", padding: "6px 10px",
                      background: isBot ? BRAND.bubbleIn : BRAND.bubbleOut,
                      borderRadius: isBot ? "0 10px 10px 10px" : "10px 0 10px 10px",
                      boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                    }}>
                      <div style={{ fontSize: 12.5, color: "#111", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{msg.text}</div>
                      <div style={{ fontSize: 9, color: "#999", textAlign: "right", marginTop: 2 }}>{msg.time}</div>
                    </div>
                    {msg.buttons && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, maxWidth: "82%" }}>
                        {msg.buttons.map((btn, j) => (
                          <button key={j} onClick={() => handleUserResponse(btn.label)} style={{
                            background: "white", border: "1px solid " + BRAND.greenDark, borderRadius: 16,
                            padding: "5px 12px", fontSize: 11, color: BRAND.greenDark, cursor: "pointer",
                            fontWeight: 500, transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { e.target.style.background = BRAND.green; e.target.style.color = "white"; }}
                          onMouseLeave={e => { e.target.style.background = "white"; e.target.style.color = BRAND.greenDark; }}
                          >{btn.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {isTyping && (
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <div style={{
                    background: "white", borderRadius: "0 12px 12px 12px", padding: "8px 14px",
                    boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                  }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 7, height: 7, borderRadius: "50%", background: "#999",
                          animation: `typingDot 1.4s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Input bar */}
        <div style={{ background: "#F0F0F0", padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && inputValue.trim()) {
                handleUserResponse(inputValue.trim());
                setInputValue("");
              }
            }}
            placeholder="Digite uma mensagem..."
            style={{
              flex: 1, border: "none", borderRadius: 18, padding: "8px 14px",
              fontSize: 12, background: "white", outline: "none",
            }}
          />
          <div onClick={() => {
            if (inputValue.trim()) { handleUserResponse(inputValue.trim()); setInputValue(""); }
          }} style={{
            width: 32, height: 32, borderRadius: 16, background: BRAND.green,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 14,
          }}>▶</div>
        </div>
        {/* Phone bottom */}
        <div style={{ height: 16, background: "#000", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: 100, height: 4, borderRadius: 2, background: "#333" }} />
        </div>
      </div>
      {/* Reset button */}
      {started && (
        <button onClick={handleReset} style={{
          marginTop: 12, background: "transparent", border: "1px solid " + BRAND.border,
          borderRadius: 8, padding: "6px 16px", color: BRAND.textSecondary,
          fontSize: 12, cursor: "pointer",
        }}>🔄 Reiniciar Teste</button>
      )}
    </div>
  );
}

// ============ BLOCK EDITOR ============
function BlockCard({ node, index, isSelected, onSelect, onUpdate, onDelete, totalCount }) {
  const blockDef = BLOCK_TYPES.find(b => b.type === node.type) || BLOCK_TYPES[0];

  return (
    <div
      onClick={() => onSelect(node.id)}
      style={{
        background: isSelected ? BRAND.surfaceLight : BRAND.surface,
        border: `1.5px solid ${isSelected ? BRAND.accent : BRAND.border}`,
        borderRadius: 12, padding: 14, cursor: "pointer",
        transition: "all 0.2s", position: "relative",
        boxShadow: isSelected ? `0 0 20px ${BRAND.accent}22` : "none",
      }}
    >
      {/* Block header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            background: blockDef.color + "22", borderRadius: 6, padding: "3px 8px",
            fontSize: 13,
          }}>{blockDef.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: blockDef.color, textTransform: "uppercase", letterSpacing: 1 }}>{blockDef.label}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ fontSize: 9, color: BRAND.textSecondary, background: BRAND.darker, borderRadius: 4, padding: "2px 6px" }}>#{index + 1}</span>
          {totalCount > 1 && (
            <button onClick={e => { e.stopPropagation(); onDelete(node.id); }} style={{
              background: "transparent", border: "none", color: "#EF444488", cursor: "pointer",
              fontSize: 12, padding: "0 4px", borderRadius: 4,
            }}
            onMouseEnter={e => e.target.style.color = "#EF4444"}
            onMouseLeave={e => e.target.style.color = "#EF444488"}
            >✕</button>
          )}
        </div>
      </div>

      {/* WhatsApp preview bubble */}
      <div style={{
        background: BRAND.bubbleIn, borderRadius: "0 10px 10px 10px", padding: "8px 12px",
        position: "relative",
      }}>
        {isSelected ? (
          <textarea
            value={node.content}
            onChange={e => onUpdate(node.id, { content: e.target.value })}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", border: "none", background: "transparent",
              fontSize: 12.5, color: "#111", resize: "none", outline: "none",
              fontFamily: "inherit", lineHeight: 1.45, minHeight: 40,
            }}
            rows={Math.max(2, node.content.split("\n").length)}
          />
        ) : (
          <div style={{ fontSize: 12.5, color: "#111", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {node.content.length > 120 ? node.content.slice(0, 120) + "..." : node.content}
          </div>
        )}
      </div>

      {/* Options for buttons */}
      {node.options && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {node.options.map((opt, i) => (
            <span key={i} style={{
              background: BRAND.darker, border: "1px solid " + BRAND.border,
              borderRadius: 14, padding: "3px 10px", fontSize: 10.5, color: BRAND.textPrimary,
            }}>{opt.label}</span>
          ))}
        </div>
      )}

      {/* Type-specific info */}
      {node.type === "collect" && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: BRAND.textSecondary }}>Salvar como:</span>
          <span style={{
            background: "#F59E0B22", color: "#F59E0B", borderRadius: 4,
            padding: "1px 8px", fontSize: 10, fontFamily: "monospace",
          }}>{`{${node.field || "campo"}}`}</span>
        </div>
      )}
      {node.type === "appointment" && node.config && (
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <span style={{ fontSize: 10, color: BRAND.textSecondary, background: BRAND.darker, borderRadius: 4, padding: "2px 8px" }}>
            1ª consulta: {node.config.first}min
          </span>
          <span style={{ fontSize: 10, color: BRAND.textSecondary, background: BRAND.darker, borderRadius: 4, padding: "2px 8px" }}>
            Retorno: {node.config.return}min
          </span>
        </div>
      )}
      {node.type === "handoff" && (
        <div style={{ marginTop: 6, fontSize: 10, color: "#EF4444", fontStyle: "italic" }}>
          → Transfere para atendimento humano
        </div>
      )}
    </div>
  );
}

// ============ MAIN APP ============
export default function ZapBotEditor() {
  const [flow, setFlow] = useState(DEFAULT_FLOW);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("editor");
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [botStatus, setBotStatus] = useState("draft");
  const [simKey, setSimKey] = useState(0);

  const updateNode = (id, updates) => {
    setFlow(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const deleteNode = (id) => {
    setFlow(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const addBlock = (type) => {
    const blockDef = BLOCK_TYPES.find(b => b.type === type);
    const newNode = {
      id: Date.now().toString(),
      type,
      content: type === "message" ? "Nova mensagem..." :
               type === "buttons" ? "Escolha uma opção:" :
               type === "collect" ? "Qual informação você precisa?" :
               type === "appointment" ? "Vou verificar os horários disponíveis..." :
               type === "condition" ? "Verificando..." :
               "Um momento, vou transferir você...",
      ...(type === "buttons" ? { options: [{ label: "Opção 1", value: "opt1" }, { label: "Opção 2", value: "opt2" }] } : {}),
      ...(type === "collect" ? { field: "novo_campo", fieldLabel: "Novo Campo" } : {}),
      ...(type === "appointment" ? { config: { first: 90, return: 60 } } : {}),
    };
    setFlow(prev => [...prev, newNode]);
    setSelectedId(newNode.id);
    setShowBlockPicker(false);
  };

  const statusColors = { draft: "#F59E0B", published: "#10B981", paused: "#EF4444" };
  const statusLabels = { draft: "Rascunho", published: "Publicado", paused: "Pausado" };

  return (
    <div style={{
      background: BRAND.darker, color: BRAND.textPrimary,
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${BRAND.border}; border-radius: 3px; }
        * { box-sizing: border-box; }
      `}</style>

      {/* ====== TOP BAR ====== */}
      <div style={{
        background: BRAND.dark, borderBottom: "1px solid " + BRAND.border,
        padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: BRAND.accent, letterSpacing: -0.5 }}>ZapBot</span>
          </div>
          <div style={{ width: 1, height: 24, background: BRAND.border }} />
          <span style={{ fontSize: 13, color: BRAND.textSecondary }}>Clínica Exemplo — Bot de Agendamento</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Status badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, background: BRAND.surface,
            borderRadius: 20, padding: "5px 14px", border: "1px solid " + BRAND.border,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColors[botStatus] }} />
            <span style={{ fontSize: 11, color: statusColors[botStatus], fontWeight: 600 }}>{statusLabels[botStatus]}</span>
          </div>
          {/* Publish button */}
          <button
            onClick={() => setBotStatus(botStatus === "published" ? "paused" : "published")}
            style={{
              background: botStatus === "published" ? "#EF4444" : BRAND.accent,
              color: "white", border: "none", borderRadius: 8, padding: "8px 20px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
            }}
          >
            {botStatus === "published" ? "⏸ Pausar" : "🚀 Publicar"}
          </button>
        </div>
      </div>

      {/* ====== MAIN AREA ====== */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT: Editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid " + BRAND.border }}>
          {/* Tabs */}
          <div style={{
            display: "flex", gap: 0, borderBottom: "1px solid " + BRAND.border,
            background: BRAND.dark, flexShrink: 0,
          }}>
            {[
              { id: "editor", label: "Editor", icon: "✏️" },
              { id: "config", label: "Agendamento", icon: "⚙️" },
              { id: "dashboard", label: "Dashboard", icon: "📊" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: "transparent", border: "none",
                borderBottom: `2px solid ${activeTab === tab.id ? BRAND.accent : "transparent"}`,
                padding: "12px 20px", color: activeTab === tab.id ? BRAND.accent : BRAND.textSecondary,
                fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.15s",
              }}>
                <span>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
            {activeTab === "editor" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}>
                {flow.map((node, i) => (
                  <div key={node.id}>
                    <BlockCard
                      node={node}
                      index={i}
                      isSelected={selectedId === node.id}
                      onSelect={setSelectedId}
                      onUpdate={updateNode}
                      onDelete={deleteNode}
                      totalCount={flow.length}
                    />
                    {/* Connector line */}
                    {i < flow.length - 1 && (
                      <div style={{ display: "flex", justifyContent: "center", padding: "2px 0" }}>
                        <div style={{ width: 2, height: 16, background: BRAND.border }} />
                      </div>
                    )}
                  </div>
                ))}

                {/* Add block button */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowBlockPicker(!showBlockPicker)}
                    style={{
                      width: "100%", background: BRAND.surface, border: `2px dashed ${BRAND.border}`,
                      borderRadius: 12, padding: "16px", cursor: "pointer",
                      color: BRAND.textSecondary, fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND.accent; e.currentTarget.style.color = BRAND.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = BRAND.border; e.currentTarget.style.color = BRAND.textSecondary; }}
                  >
                    <span style={{ fontSize: 18 }}>+</span> Adicionar Bloco
                  </button>
                  {showBlockPicker && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                      background: BRAND.surface, border: "1px solid " + BRAND.border,
                      borderRadius: 12, padding: 8, zIndex: 10,
                      boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
                    }}>
                      {BLOCK_TYPES.map(bt => (
                        <button key={bt.type} onClick={() => addBlock(bt.type)} style={{
                          width: "100%", background: "transparent", border: "none",
                          borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 10,
                          color: BRAND.textPrimary, transition: "all 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = BRAND.surfaceLight}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <span style={{
                            background: bt.color + "22", borderRadius: 6, padding: "4px 8px",
                            fontSize: 16, width: 32, textAlign: "center",
                          }}>{bt.icon}</span>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{bt.label}</div>
                            <div style={{ fontSize: 10, color: BRAND.textSecondary }}>{bt.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "config" && (
              <div style={{ maxWidth: 480 }}>
                <h3 style={{ color: BRAND.accent, fontSize: 16, margin: "0 0 16px", fontWeight: 700 }}>⚙️ Configuração de Agendamento</h3>
                {[
                  { label: "Profissional", value: "Dr. Silva — Psiquiatra" },
                  { label: "Dias disponíveis", value: "Seg, Ter, Qua, Qui, Sex" },
                  { label: "Horários", value: "08:00 — 18:00" },
                  { label: "1ª Consulta", value: "90 minutos" },
                  { label: "Retorno", value: "60 minutos" },
                  { label: "Intervalo", value: "15 minutos" },
                  { label: "Antecedência máxima", value: "60 dias" },
                  { label: "Calendário", value: "Google Calendar — conectado ✅" },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", background: i % 2 === 0 ? BRAND.surface : "transparent",
                    borderRadius: 8, marginBottom: 2,
                  }}>
                    <span style={{ fontSize: 12, color: BRAND.textSecondary, fontWeight: 600 }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: BRAND.textPrimary }}>{item.value}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "dashboard" && (
              <div style={{ maxWidth: 520 }}>
                <h3 style={{ color: BRAND.accent, fontSize: 16, margin: "0 0 16px", fontWeight: 700 }}>📊 Dashboard</h3>
                {/* Stats cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Conversas Hoje", value: "23", trend: "+12%", color: "#3B82F6" },
                    { label: "Agendamentos", value: "8", trend: "+25%", color: "#10B981" },
                    { label: "Taxa de Conclusão", value: "74%", trend: "+5%", color: "#8B5CF6" },
                  ].map((stat, i) => (
                    <div key={i} style={{
                      background: BRAND.surface, borderRadius: 12, padding: 14,
                      border: "1px solid " + BRAND.border,
                    }}>
                      <div style={{ fontSize: 10, color: BRAND.textSecondary, marginBottom: 6 }}>{stat.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 10, color: "#10B981", marginTop: 4 }}>↑ {stat.trend}</div>
                    </div>
                  ))}
                </div>
                {/* Mini chart placeholder */}
                <div style={{
                  background: BRAND.surface, borderRadius: 12, padding: 16,
                  border: "1px solid " + BRAND.border,
                }}>
                  <div style={{ fontSize: 12, color: BRAND.textSecondary, marginBottom: 12, fontWeight: 600 }}>Conversas — Últimos 7 dias</div>
                  <div style={{ display: "flex", alignItems: "end", gap: 6, height: 80 }}>
                    {[35, 42, 28, 55, 48, 62, 45].map((v, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{
                          width: "100%", height: v * 1.2, background: `linear-gradient(to top, ${BRAND.accent}44, ${BRAND.accent})`,
                          borderRadius: 4, transition: "height 0.3s",
                        }} />
                        <span style={{ fontSize: 8, color: BRAND.textSecondary }}>
                          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Drop-off indicator */}
                <div style={{
                  background: BRAND.surface, borderRadius: 12, padding: 16,
                  border: "1px solid " + BRAND.border, marginTop: 10,
                }}>
                  <div style={{ fontSize: 12, color: BRAND.textSecondary, marginBottom: 12, fontWeight: 600 }}>Pontos de Abandono</div>
                  {[
                    { step: "Menu principal", pct: 100, color: "#10B981" },
                    { step: "Tipo de consulta", pct: 82, color: "#10B981" },
                    { step: "Coleta de nome", pct: 71, color: "#F59E0B" },
                    { step: "Seleção de horário", pct: 64, color: "#F59E0B" },
                    { step: "Confirmação", pct: 58, color: "#EF4444" },
                  ].map((item, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10.5, color: BRAND.textPrimary }}>{item.step}</span>
                        <span style={{ fontSize: 10.5, color: item.color, fontWeight: 600 }}>{item.pct}%</span>
                      </div>
                      <div style={{ height: 4, background: BRAND.darker, borderRadius: 2 }}>
                        <div style={{ height: "100%", width: item.pct + "%", background: item.color, borderRadius: 2, transition: "width 0.5s" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Phone Simulator */}
        <div style={{
          width: 380, minWidth: 380, background: BRAND.dark,
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: 20,
        }}>
          <div style={{ fontSize: 11, color: BRAND.textSecondary, marginBottom: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
            📱 Simulador de Teste
          </div>
          <PhoneSimulator key={simKey} flow={flow} onReset={() => setSimKey(k => k + 1)} />
        </div>
      </div>
    </div>
  );
}
