import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WhatsAppConnectionForm from "./WhatsAppConnectionForm";

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
  backLink: {
    color: "#6b7280",
    textDecoration: "none",
    fontSize: "0.875rem",
  },
};

export default async function WhatsAppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    redirect("/login");
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Conexao WhatsApp</h1>
        <a href="/dashboard" style={styles.backLink}>
          &larr; Voltar ao painel
        </a>
      </div>

      <WhatsAppConnectionForm accessToken={session.access_token} />
    </div>
  );
}
