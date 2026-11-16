import type { CSSProperties } from "react";

// Pasado este largo, el título se arma por palabras y no por letras (nombres de proyecto).
const MAX_CHARS = 24;

// Letras (o palabras) de un título que suben desde una ranura bajo la línea de base. Cada
// palabra es su propia máscara, así el título se parte entre palabras y nunca a mitad de una.
// Server Component. Los lectores de pantalla leen la copia oculta, no las letras sueltas.
export function RevealText({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const byWord = text.length > MAX_CHARS;
  const total = byWord ? words.length : words.reduce((n, w) => n + Array.from(w).length, 0);
  let index = 0;

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" style={{ "--n": total } as CSSProperties}>
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
    </>
  );
}

function Piece({ i, children }: { i: number; children: string }) {
  return (
    <span className="reveal-title__piece" style={{ "--i": i } as CSSProperties}>
      {children}
    </span>
  );
}
