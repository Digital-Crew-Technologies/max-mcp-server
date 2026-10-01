import { z } from "zod";
import { withToken } from "../shared";

const modeSchema = z
  .enum(["lite", "full"])
  .optional()
  .describe(
    "Research depth. 'lite' (default) returns a fast first-pass; 'full' does deeper multi-source research and takes longer.",
  );

export const claireSearchSchema = z.object({
  ...withToken,
  query: z
    .string()
    .min(1)
    .describe(
      "Free-text research query (e.g. 'recent Series B fundraises in fintech 2026').",
    ),
  mode: modeSchema,
});

export const claireDeepResearchSchema = z.object({
  ...withToken,
  name: z
    .string()
    .min(1)
    .describe(
      "Name of the person or company to research (e.g. 'Stripe' or 'Patrick Collison').",
    ),
  entity_type: z
    .enum(["person", "company"])
    .describe("Whether `name` refers to a person or a company."),
  mode: modeSchema,
});

export const claireMarketWatchSchema = z.object({
  ...withToken,
  url: z
    .string()
    .url()
    .describe("Company / market URL to monitor for changes."),
  criteria: z
    .string()
    .optional()
    .describe(
      "Optional filter criteria — what to watch for (e.g. 'pricing changes', 'new hires').",
    ),
  mode: modeSchema,
});

export const claireCompetitorFinderSchema = z.object({
  ...withToken,
  url: z
    .string()
    .url()
    .describe("Company website URL to find direct competitors for."),
});

export const claireExtractProspectsFromUrlSchema = z.object({
  ...withToken,
  url: z
    .string()
    .url()
    .describe(
      "Public URL to extract prospects (people / contacts) from — e.g. a conference attendee list, a team page, a press release. Claire fetches and structures the page.",
    ),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe("Maximum number of prospects to return (1–200). Default 50."),
  prompt_override: z
    .string()
    .optional()
    .describe(
      "Optional extraction instructions that override the default Claire prompt — e.g. 'only return CTOs', 'include LinkedIn URLs if present'.",
    ),
});
