import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RP Backoffice", template: "%s · RP Backoffice" },
  description: "Honorarios, adicionales y planos vigentes para estudios de arquitectura.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      {/* Extensiones como Grammarly agregan atributos al <body> antes de hidratar; solo afecta
          a los atributos de este elemento, los errores de hidratación del contenido se siguen viendo. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
