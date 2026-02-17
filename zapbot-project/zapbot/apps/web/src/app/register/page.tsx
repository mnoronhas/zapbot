"use client";

import { useState } from "react";
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
  success: {
    backgroundColor: "#f0fdf4",
    border: "1px solid #86efac",
    color: "#166534",
    padding: "1rem",
    borderRadius: "4px",
    marginBottom: "1rem",
    fontSize: "0.875rem",
    textAlign: "center" as const,
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

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName,
        },
      },
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        setError("Este e-mail ja esta cadastrado. Tente entrar ou redefinir sua senha.");
      } else if (authError.message.includes("Password should be")) {
        setError("A senha deve ter pelo menos 6 caracteres.");
      } else {
        setError("Erro ao criar conta. Tente novamente.");
      }
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  const handleGoogleRegister = async () => {
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
      setError("Erro ao cadastrar com Google. Tente novamente.");
      setLoading(false);
    }
    // On success, browser is redirected by Supabase — no manual redirect needed
  };

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Conta criada!</h1>
          <div style={styles.success}>
            <p>
              <strong>Cadastro realizado!</strong> Verifique seu e-mail para confirmar sua conta.
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              Apos confirmar, voce podera{" "}
              <Link href="/login" style={styles.linkAnchor}>
                entrar aqui
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Criar conta no ZapBot</h1>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleRegister}>
          <div style={styles.formGroup}>
            <label htmlFor="businessName" style={styles.label}>
              Nome da empresa
            </label>
            <input
              id="businessName"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Clinica Exemplo"
              required
              disabled={loading}
              style={{
                ...styles.input,
                ...(loading ? styles.buttonDisabled : {}),
              }}
            />
          </div>

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
              minLength={6}
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
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <div style={styles.divider}>ou</div>

        <button
          type="button"
          onClick={handleGoogleRegister}
          disabled={loading}
          style={{
            ...styles.buttonGoogle,
            ...(loading ? styles.buttonDisabled : {}),
          }}
        >
          Cadastrar com Google
        </button>

        <p style={styles.link}>
          Ja tem conta?{" "}
          <Link href="/login" style={styles.linkAnchor}>
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
