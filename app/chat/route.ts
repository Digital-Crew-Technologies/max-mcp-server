// POST /chat
// Simple conversational endpoint for Mattermost integration.
// Accepts { message, username } and returns { reply }.

import { NextRequest } from "next/server";
import { checkChatDailyCap, checkChatRateLimit } from "@/shared/http/chat-rate-limit";

const SYSTEM_PROMPT = `You are Max, a B2B outbound sales AI assistant on the Digital Crew platform.
You help sales teams with outreach, messaging, and pipeline strategy.
Keep replies concise — 1-3 sentences. Be direct and confident. No filler phrases.`;

export async function POST(request: NextRequest): Promise<Response> {
  let body: { message?: string; username?: string };
  try {
    body = (await request.json()) as { message?: string; username?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const username = body.username ?? "user";
  const principal = request.headers.get("x-mcp-gateway-key")?.trim() ?? username;

  const minute = checkChatRateLimit(principal);
  if (!minute.ok) {
    return Response.json(
      { error: "Rate limit exceeded", retryAfterSec: minute.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(minute.retryAfterSec) } },
    );
  }

  const daily = checkChatDailyCap(principal);
  if (!daily.ok) {
    return Response.json({ error: "Daily chat request cap exceeded" }, { status: 429 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    console.error("[chat] OPENROUTER_API_KEY not set");
    return Response.json({ reply: "Max is unavailable right now" }, { status: 200 });
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${username}: ${message}` },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[chat] OpenRouter error ${res.status}: ${errText}`);
      return Response.json({ reply: "Max is unavailable right now" }, { status: 200 });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "Done.";
    return Response.json({ reply });
  } catch (err) {
    console.error("[chat] fetch failed:", err);
    return Response.json({ reply: "Max is unavailable right now" }, { status: 200 });
  }
}
