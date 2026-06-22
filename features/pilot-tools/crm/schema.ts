import { z } from "zod";
import { withToken } from "../shared";

export const crmSearchContactsSchema = z.object({
  ...withToken,
  query: z
    .string()
    .min(1)
    .describe("Free-text search over CRM contacts (name, email, company)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max results to return (default 20)."),
});

export const crmGetContactSchema = z.object({
  ...withToken,
  email: z
    .string()
    .email()
    .describe("Email of the contact to fetch (the dedup identity)."),
});

export const crmUpsertContactSchema = z.object({
  ...withToken,
  email: z
    .string()
    .email()
    .describe("Contact email — the dedup key. An existing contact is updated, never duplicated."),
  firstName: z.string().optional().describe("First name."),
  lastName: z.string().optional().describe("Last name."),
  company: z.string().optional().describe("Company name."),
  jobTitle: z.string().optional().describe("Job title."),
  phone: z.string().optional().describe("Phone number."),
});

export const crmUpsertCompanySchema = z.object({
  ...withToken,
  domain: z
    .string()
    .min(1)
    .describe("Company domain (e.g. acme.com) — the dedup key. Existing company is updated, never duplicated."),
  name: z.string().optional().describe("Company name."),
});

export const crmStatusSchema = z.object({
  ...withToken,
});
