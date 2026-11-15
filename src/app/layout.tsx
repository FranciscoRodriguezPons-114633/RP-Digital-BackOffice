import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-script";
import "./globals.css";

// Inter con cifras tabulares para los importes. Next la descarga al compilar y la sirve
// desde la app: el navegador no le pide nada a Google.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "RP Backoffice", template: "%s · RP Backoffice" },
  description: "Honorarios, adicionales, presupuestos de obra y planos vigentes para estudios y constructoras.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script de abajo pone data-theme antes de pintar, según lo
    // que eligió la persona (ver components/theme.tsx). Solo afecta a los atributos de <html>.
    <html lang="es-AR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Extensiones como Grammarly agregan atributos al <body> antes de hidratar; solo afecta
          a los atributos de este elemento, los errores de hidratación del contenido se siguen viendo. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
