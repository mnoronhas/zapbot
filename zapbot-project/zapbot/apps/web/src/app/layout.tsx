import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZapBot",
  description: "Construtor de chatbots para WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
