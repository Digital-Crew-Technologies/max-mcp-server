export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Max MCP Server</h1>
      <p style={{ lineHeight: 1.6, color: "#333" }}>
        MCP endpoint for Digital Crew&apos;s Max agent. Connect your client to{" "}
        <code>/mcp</code> (Streamable HTTP).
      </p>
      <p>
        <a href="https://digitalcrew.tech">Digital Crew</a>
        {" · "}
        <a href="https://max.digitalcrew.tech">Max</a>
      </p>
    </main>
  );
}
