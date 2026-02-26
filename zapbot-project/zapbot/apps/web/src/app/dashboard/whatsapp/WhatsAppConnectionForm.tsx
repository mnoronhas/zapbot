"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type ConnectionData = {
  id?: string;
  instanceName?: string;
  displayPhoneNumber?: string | null;
  status: string;
  qrCode?: string | null;
  pairingCode?: string | null;
  connectionId?: string;
};

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:4000";

const styles = {
  card: {
    backgroundColor: "#ffffff",
    padding: "2rem",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    maxWidth: "480px",
  },
  sectionTitle: {
    fontSize: "1.125rem",
    fontWeight: "600" as const,
    color: "#1a1a1a",
    marginTop: 0,
    marginBottom: "1rem",
  },
  description: {
    color: "#6b7280",
    fontSize: "0.875rem",
    marginBottom: "1.5rem",
    lineHeight: "1.5",
  },
  button: {
    padding: "0.75rem 1.5rem",
    backgroundColor: "#25D366",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: "600" as const,
    cursor: "pointer",
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed" as const,
  },
  disconnectButton: {
    padding: "0.5rem 1rem",
    backgroundColor: "#ffffff",
    color: "#dc2626",
    border: "1px solid #dc2626",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: "500" as const,
    cursor: "pointer",
    marginTop: "1rem",
  },
  qrContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "1rem",
  },
  qrImage: {
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  scanText: {
    color: "#374151",
    fontSize: "0.875rem",
    fontWeight: "500" as const,
    textAlign: "center" as const,
  },
  pollText: {
    color: "#9ca3af",
    fontSize: "0.75rem",
    textAlign: "center" as const,
  },
  connectedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 1rem",
    backgroundColor: "#f0fdf4",
    color: "#166534",
    borderRadius: "9999px",
    fontSize: "0.875rem",
    fontWeight: "600" as const,
    marginBottom: "1rem",
  },
  greenDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#22c55e",
  },
  phoneNumber: {
    color: "#374151",
    fontSize: "0.875rem",
    marginBottom: "0.25rem",
  },
  error: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: "0.75rem 1rem",
    borderRadius: "6px",
    fontSize: "0.875rem",
    marginBottom: "1rem",
  },
};

type Props = {
  accessToken: string;
};

export default function WhatsAppConnectionForm({ accessToken }: Props) {
  const [connection, setConnection] = useState<ConnectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  // Fetch current connection on mount
  const fetchConnection = useCallback(async () => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/whatsapp-connections`, { headers });
      if (!res.ok) throw new Error("Erro ao buscar conexao");
      const json = await res.json();
      setConnection(json.data);
    } catch {
      setError("Erro ao carregar status da conexao");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  // Poll status when pending
  useEffect(() => {
    if (connection?.status !== "pending") {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${ENGINE_URL}/api/v1/whatsapp-connections/status`, { headers });
        if (!res.ok) return;
        const json = await res.json();
        if (json.data?.status === "connected") {
          setConnection((prev) => ({
            ...prev,
            status: "connected",
            displayPhoneNumber: json.data.displayPhoneNumber,
          }));
        }
      } catch {
        // Silently retry on next interval
      }
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.status, accessToken]);

  const handleConnect = async () => {
    setCreating(true);
    setError(null);

    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/whatsapp-connections`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erro ao criar conexao");
      }

      const json = await res.json();
      setConnection({
        connectionId: json.data.connectionId,
        instanceName: json.data.instanceName,
        status: "pending",
        qrCode: json.data.qrCode,
        pairingCode: json.data.pairingCode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setCreating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection?.id && !connection?.connectionId) return;
    const connId = connection.id || connection.connectionId;

    try {
      await fetch(`${ENGINE_URL}/api/v1/whatsapp-connections/${connId}`, {
        method: "DELETE",
        headers,
      });
      setConnection(null);
    } catch {
      setError("Erro ao desconectar WhatsApp");
    }
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <p style={styles.description}>Carregando...</p>
      </div>
    );
  }

  // State 3: Connected
  if (connection?.status === "connected") {
    return (
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>WhatsApp</h2>
        <div style={styles.connectedBadge}>
          <span style={styles.greenDot} />
          Conectado
        </div>
        {connection.displayPhoneNumber && (
          <p style={styles.phoneNumber}>
            Numero: <strong>{connection.displayPhoneNumber}</strong>
          </p>
        )}
        <p style={styles.description}>
          Seu WhatsApp esta conectado e pronto para receber mensagens.
        </p>
        <button
          type="button"
          onClick={handleDisconnect}
          style={styles.disconnectButton}
        >
          Desconectar
        </button>
      </div>
    );
  }

  // State 2: Pending — QR code shown
  if (connection?.status === "pending" && connection.qrCode) {
    return (
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Escaneie o QR Code</h2>
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.qrContainer}>
          <img
            src={`data:image/png;base64,${connection.qrCode}`}
            alt="QR Code para conectar WhatsApp"
            width={280}
            height={280}
            style={styles.qrImage}
          />
          <p style={styles.scanText}>
            Abra o WhatsApp no seu celular e escaneie o QR code acima.
          </p>
          <p style={styles.pollText}>
            Aguardando conexao...
          </p>
        </div>
      </div>
    );
  }

  // State 1: No connection
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>Conectar WhatsApp</h2>
      {error && <div style={styles.error}>{error}</div>}
      <p style={styles.description}>
        Conecte o WhatsApp da sua empresa para que o bot possa receber e
        responder mensagens automaticamente. Voce precisara escanear um QR
        code com o WhatsApp do numero que deseja usar.
      </p>
      <button
        type="button"
        onClick={handleConnect}
        disabled={creating}
        style={{
          ...styles.button,
          ...(creating ? styles.buttonDisabled : {}),
        }}
      >
        {creating ? "Conectando..." : "Conectar WhatsApp"}
      </button>
    </div>
  );
}
