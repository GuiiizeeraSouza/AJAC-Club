"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0c0b09",
          color: "#fdf3dc",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ajac-badge.png" alt="AJAC" width={120} style={{ height: "auto" }} />
          <h1 style={{ fontSize: 24, margin: "20px 0 8px" }}>Não conseguimos carregar a lista de canais</h1>
          <p style={{ color: "#a8a294", margin: 0 }}>
            A fonte da lista pode estar instável. Tente novamente em instantes.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              background: "#d4af37",
              color: "#0c0b09",
              border: 0,
              borderRadius: 12,
              padding: "10px 20px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
