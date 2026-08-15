import type { Metadata, Viewport } from "next";
import "./globals.css";
import ContaRodape from "@/components/ContaRodape";
import ContaTopo from "@/components/ContaTopo";
import { getSessao } from "@/lib/session";

export const metadata: Metadata = {
  title: "Meu Fichário Pokémon",
  description: "Monte o fichário, marque o que você tem e imprima o que falta.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#17161a" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A conta vive no rodape das duas telas, sempre no mesmo lugar. Ler a sessao
  // aqui evita que cada pagina tenha de se lembrar de passa-la adiante.
  const sessao = await getSessao();

  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">
        {/* Quem nao tem sessao pode ser alguem cujo fichario existe e esta fora
            de alcance — e para essa pessoa a tela parece vazia. O caminho de
            volta fica no topo, antes das cartas. Quem ja entrou nunca ve. */}
        {sessao === null && <ContaTopo />}
        {children}
        <ContaRodape
          autenticado={sessao !== null}
          anonima={sessao?.anonima ?? false}
          email={sessao?.email ?? null}
        />
      </body>
    </html>
  );
}
