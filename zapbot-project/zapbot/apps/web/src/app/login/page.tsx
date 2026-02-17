"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
  },
  card: {
    backgroundColor: "#ffffff",
    padding: "2rem",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    width: "100%",
    maxWidth: "400px",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "1.5rem",
    textAlign: "center" as const,
    color: "#1a1a1a",
  },
  formGroup: {
    marginBottom: "1rem",
  },
  label: {
    display: "block",
    marginBottom: "0.25rem",
    fontWeight: "500",
    color: "#333",
    fontSize: "0.875rem",
  },
  input: {
    width: "100%",
    padding: "0.625rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    fontSize: "1rem",
    boxSizing: "border-box" as const,
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: "#25d366",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "0.75rem",
  },
  buttonGoogle: {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: "#4285f4",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "1rem",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  divider: {
    textAlign: "center" as const,
    margin: "1rem 0",
    color: "#6b7280",
    fontSize: "0.875rem",
  },
  error: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    color: "#b91c1c",
    padding: "0.75rem",
    borderRadius: "4px",
    marginBottom: "1rem",
    fontSize: "0.875rem",
  },
  link: {
    textAlign: "center" as const,
    fontSize: "0.875rem",
    color: "#6b7280",
  },
  linkAnchor: {
    color: "#25d366",
    textDecoration: "none",
    fontWeight: "500",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      if (authError.message.includes("Invalid login credentials")) {
        setError("E-mail ou senha incorretos. Verifique suas credenciais.");
      } else if (authError.message.includes("Email not confirmed")) {
        setError("Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.");
      } else {
        setError("Erro ao entrar. Tente novamente.");
      }
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "openid email profile",
      },
    });

    if (authError) {
      setError("Erro ao entrar com Google. Tente novamente.");
      setLoading(false);
    }
    // On success, browser is redirected by Supabase — no manual redirect needed
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Entrar no ZapBot</h1>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleEmailLogin}>
          <div style={styles.formGroup}>
            <label htmlFor="email" style={styles.label}>
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              disabled={loading}
              style={{
                ...styles.input,
                ...(loading ? styles.buttonDisabled : {}),
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="password" style={styles.label}>
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
              disabled={loading}
              style={{
                ...styles.input,
                ...(loading ? styles.buttonDisabled : {}),
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div style={styles.divider}>ou</div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            ...styles.buttonGoogle,
            ...(loading ? styles.buttonDisabled : {}),
          }}
        >
          Entrar com Google
        </button>

        <p style={styles.link}>
          Nao tem conta?{" "}
          <Link href="/register" style={styles.linkAnchor}>
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
