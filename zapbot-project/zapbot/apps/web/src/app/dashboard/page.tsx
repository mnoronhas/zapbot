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
  placeholder: {
    backgroundColor: "#f0fdf4",
    border: "1px solid #86efac",
    color: "#166534",
    padding: "1.5rem",
    borderRadius: "8px",
    fontSize: "0.875rem",
  },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Painel</h1>
        <LogoutButton />
      </div>

      <div style={styles.card}>
        <div style={styles.info}>
          <p style={styles.label}>Logado como</p>
          <p style={styles.value}>{user.email}</p>
        </div>
        <div style={styles.info}>
          <p style={styles.label}>User ID</p>
          <p style={styles.value}>{user.id}</p>
        </div>
      </div>

      <div style={styles.placeholder}>
        <strong>Bem-vindo ao ZapBot!</strong>
        <p style={{ marginTop: "0.5rem" }}>
          O painel sera construido nas proximas fases. Por agora, a autenticacao esta funcionando.
        </p>
      </div>
    </div>
  );
}
