import type { CSSProperties } from "react";

// Pasado este largo, el título se arma por palabras y no por letras (nombres de proyecto).
const MAX_CHARS = 24;

// Título con máscara (SPEC-animaciones §2.1): cada letra sube desde una ranura bajo la línea
// de base. Cada palabra es su propia máscara, así el título se parte entre palabras y nunca
// a mitad de una. Server Component: no usa hooks. Los lectores de pantalla leen la copia
// oculta, no las letras sueltas.
export function RevealTitle({ text, className = "text-2xl font-semibold" }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const byWord = text.length > MAX_CHARS;
  const total = byWord ? words.length : words.reduce((n, w) => n + Array.from(w).length, 0);
  let index = 0;

  return (
    <h1 className={className} style={{ "--n": total } as CSSProperties}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <span key={w}>
            {w > 0 && " "}
            <span className="reveal-title__mask">
              {byWord ? (
                <Piece i={index++}>{word}</Piece>
              ) : (
                Array.from(word).map((c, k) => (
                  <Piece key={k} i={index++}>
                    {c}
                  </Piece>
                ))
              )}
            </span>
          </span>
        ))}
      </span>
    </h1>
  );
}

function Piece({ i, children }: { i: number; children: string }) {
  return (
    <span className="reveal-title__piece" style={{ "--i": i } as CSSProperties}>
      {children}
    </span>
  );
}
