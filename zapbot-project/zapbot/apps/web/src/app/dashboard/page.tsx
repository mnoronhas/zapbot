import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    padding: "2rem",
  },
  header: {
    backgroundColor: "#ffffff",
    padding: "1rem 2rem",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    color: "#1a1a1a",
    margin: 0,
  },
  card: {
    backgroundColor: "#ffffff",
    padding: "1.5rem",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    marginBottom: "1rem",
  },
  sectionTitle: {
    fontSize: "1.125rem",
    fontWeight: "600",
    color: "#1a1a1a",
    marginTop: 0,
    marginBottom: "1rem",
  },
  info: {
    color: "#374151",
    fontSize: "0.875rem",
    marginBottom: "0.5rem",
  },
  label: {
    fontWeight: "600",
    color: "#6b7280",
    fontSize: "0.75rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  value: {
    color: "#1a1a1a",
    fontSize: "0.875rem",
    fontFamily: "monospace",
  },
  warning: {
    backgroundColor: "#fffbeb",
    border: "1px solid #fbbf24",
    color: "#92400e",
    padding: "1rem",
    borderRadius: "8px",
    fontSize: "0.875rem",
    marginBottom: "1rem",
  },
  emptyState: {
    color: "#6b7280",
    fontSize: "0.875rem",
    fontStyle: "italic",
  },
  badge: {
    display: "inline-block",
    padding: "0.25rem 0.75rem",
    borderRadius: "9999px",
    fontSize: "0.75rem",
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
};

type AccountData = {
  id: string;
  email: string;
  businessName: string;
  businessPhone: string | null;
  businessType: string | null;
  plan: string;
  status: string;
  createdAt: string;
};

type BotData = {
  id: string;
  name: string;
  status: string;
  version: number;
  createdAt: string;
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function planLabel(plan: string): string {
  const labels: Record<string, string> = {
    free: "Gratuito",
    professional: "Profissional",
    clinic_plus: "Clinica+",
  };
  return labels[plan] || plan;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Ativo",
    suspended: "Suspenso",
    cancelled: "Cancelado",
  };
  return labels[status] || status;
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "#166534",
    suspended: "#92400e",
    cancelled: "#991b1b",
  };
  return colors[status] || "#374151";
}

function statusBg(status: string): string {
  const bgs: Record<string, string> = {
    active: "#f0fdf4",
    suspended: "#fffbeb",
    cancelled: "#fef2f2",
  };
  return bgs[status] || "#f5f5f5";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get session to access the JWT for engine API calls.
  // Safe here because we already verified the user above with getUser().
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let account: AccountData | null = null;
  let accountError: string | null = null;
  let botsList: BotData[] = [];
  let botsError: string | null = null;

  if (session?.access_token) {
    const engineUrl = process.env.ENGINE_URL || "http://localhost:4000";

    // Fetch account data from the engine API
    try {
      const accountRes = await fetch(`${engineUrl}/api/v1/account`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (accountRes.ok) {
        const json = await accountRes.json();
        account = json.data;
      } else {
        accountError = `Erro ao carregar dados da conta (status ${accountRes.status})`;
      }
    } catch {
      accountError =
        "Nao foi possivel conectar ao servidor. Verifique se o engine esta rodando na porta 4000.";
    }

    // Fetch bots list from the engine API
    try {
      const botsRes = await fetch(`${engineUrl}/api/v1/bots`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (botsRes.ok) {
        const json = await botsRes.json();
        botsList = json.data || [];
      } else {
        botsError = `Erro ao carregar bots (status ${botsRes.status})`;
      }
    } catch {
      botsError = "Nao foi possivel carregar a lista de bots.";
    }
  } else {
    accountError = "Sessao expirada. Faca login novamente.";
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Painel</h1>
        <LogoutButton />
      </div>

      {/* API connection warning */}
      {accountError && <div style={styles.warning}>{accountError}</div>}

      {/* Account data card */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Dados da conta</h2>

        {account ? (
          <>
            <div style={styles.info}>
              <p style={styles.label}>Nome da empresa:</p>
              <p style={styles.value}>{account.businessName}</p>
            </div>
            <div style={styles.info}>
              <p style={styles.label}>E-mail:</p>
              <p style={styles.value}>{account.email}</p>
            </div>
            <div style={styles.info}>
              <p style={styles.label}>Plano:</p>
              <p style={styles.value}>{planLabel(account.plan)}</p>
            </div>
            <div style={styles.info}>
              <p style={styles.label}>Status:</p>
              <span
                style={{
                  ...styles.badge,
                  color: statusColor(account.status),
                  backgroundColor: statusBg(account.status),
                }}
              >
                {statusLabel(account.status)}
              </span>
            </div>
            <div style={{ ...styles.info, marginBottom: 0 }}>
              <p style={styles.label}>Membro desde:</p>
              <p style={styles.value}>{formatDate(account.createdAt)}</p>
            </div>
          </>
        ) : (
          <>
            {/* Fallback: show Supabase user info if engine API is unavailable */}
            <div style={styles.info}>
              <p style={styles.label}>E-mail:</p>
              <p style={styles.value}>{user.email}</p>
            </div>
            <div style={styles.info}>
              <p style={styles.label}>User ID:</p>
              <p style={styles.value}>{user.id}</p>
            </div>
          </>
        )}
      </div>

      {/* WhatsApp connection card */}
      <a
        href="/dashboard/whatsapp"
        style={{
          ...styles.card,
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          textDecoration: "none",
          cursor: "pointer",
          transition: "box-shadow 0.2s",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            backgroundColor: "#25D366",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#fff", fontSize: "1.5rem", lineHeight: 1 }}>W</span>
        </div>
        <div>
          <p
            style={{
              margin: 0,
              fontWeight: "600",
              color: "#1a1a1a",
              fontSize: "1rem",
            }}
          >
            Conectar WhatsApp
          </p>
          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "0.8125rem",
              marginTop: "0.25rem",
            }}
          >
            Configure a conexao do seu WhatsApp Business via QR code.
          </p>
        </div>
      </a>

      {/* Bots card */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Seus bots</h2>

        {botsError && (
          <div style={{ ...styles.warning, marginBottom: "0.5rem" }}>
            {botsError}
          </div>
        )}

        {botsList.length > 0 ? (
          botsList.map((bot) => (
            <div
              key={bot.id}
              style={{
                padding: "0.75rem",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: "500",
                    color: "#1a1a1a",
                    fontSize: "0.875rem",
                  }}
                >
                  {bot.name}
                </p>
                <p
                  style={{
                    margin: 0,
                    color: "#6b7280",
                    fontSize: "0.75rem",
                  }}
                >
                  v{bot.version} &middot; {formatDate(bot.createdAt)}
                </p>
              </div>
              <span
                style={{
                  ...styles.badge,
                  color:
                    bot.status === "published"
                      ? "#166534"
                      : bot.status === "paused"
                        ? "#92400e"
                        : "#374151",
                  backgroundColor:
                    bot.status === "published"
                      ? "#f0fdf4"
                      : bot.status === "paused"
                        ? "#fffbeb"
                        : "#f5f5f5",
                }}
              >
                {bot.status === "published"
                  ? "Publicado"
                  : bot.status === "paused"
                    ? "Pausado"
                    : "Rascunho"}
              </span>
            </div>
          ))
        ) : (
          <p style={styles.emptyState}>Nenhum bot criado ainda.</p>
        )}
      </div>
    </div>
  );
}
