import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Max MCP Server — Digital Crew",
    template: "%s — Digital Crew Max MCP",
  },
  description:
    "Model Context Protocol (MCP) server for Max, Digital Crew’s AI sales agent. Exposes workspace profile tools via Streamable HTTP for Digital Crew integrations.",
  applicationName: "Max MCP Server",
  authors: [{ name: "Digital Crew", url: "https://digitalcrew.tech" }],
  keywords: [
    "Digital Crew",
    "Max",
    "MCP",
    "Model Context Protocol",
    "AI sales",
    "Next.js",
  ],
  openGraph: {
    title: "Max MCP Server — Digital Crew",
    description:
      "MCP tools for Max: read and update workspace profile settings against the Digital Crew API.",
    siteName: "Digital Crew",
    type: "website",
    url: "https://max.digitalcrew.tech",
  },
  twitter: {
    card: "summary_large_image",
    title: "Max MCP Server — Digital Crew",
    description:
      "MCP server for Max — workspace profile tools for Digital Crew agents.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
