"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const styles = {
  button: {
    padding: "0.5rem 1rem",
    backgroundColor: "#ffffff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    fontSize: "0.875rem",
    fontWeight: "500",
    cursor: "pointer",
  },
};

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button type="button" onClick={handleLogout} style={styles.button}>
      Sair
    </button>
  );
}
