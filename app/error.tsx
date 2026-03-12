"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#1D1D1F",
        padding: 24,
        textAlign: "center",
      }}
    >
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
        Something went wrong
      </h2>
      <p style={{ color: "#6E6E73", marginBottom: 24, maxWidth: 400 }}>
        {error.message || "The dashboard encountered an unexpected error."}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "10px 24px",
          borderRadius: 10,
          border: "none",
          background: "#1D1D1F",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
