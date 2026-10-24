import assert from "node:assert/strict";
import { test } from "vitest";
import {
  appEnv,
  assertAllowedHost,
  assertNoProductionHostsInEnv,
  installProductionHostGuard,
  isProductionHost,
  productionHostVariables,
  ProductionHostError,
} from "./app-env";

test("APP_ENV defaults to production and rejects unknown values", () => {
  assert.equal(appEnv({}), "production");
  assert.equal(appEnv({ APP_ENV: "" }), "production");
  assert.equal(appEnv({ APP_ENV: "Staging" }), "staging");
  assert.equal(appEnv({ APP_ENV: "preprod" }), "preprod");
  assert.throws(() => appEnv({ APP_ENV: "prod" }), /APP_ENV must be one of/);
});

test("production hosts are digitalcrew.tech and its subdomains only", () => {
  for (const host of ["digitalcrew.tech", "www.digitalcrew.tech", "claire-api.digitalcrew.tech", ".digitalcrew.tech", "MAX.DIGITALCREW.TECH"]) {
    assert.equal(isProductionHost(host), true, host);
  }
  for (const host of ["www.digitalcrew-staging.tech", "digitalcrew.tech.evil.example", "notdigitalcrew.tech", "localhost"]) {
    assert.equal(isProductionHost(host), false, host);
  }
});

test("staging + production host is refused", () => {
  const env = { APP_ENV: "staging" };
  assert.throws(() => assertAllowedHost("https://max.digitalcrew.tech/api/v1/x", env), ProductionHostError);
  assert.throws(() => assertAllowedHost(new URL("https://www.digitalcrew.tech"), env), /APP_ENV=staging/);
  assert.throws(() => assertAllowedHost("https://claire-api.digitalcrew.tech", { APP_ENV: "preprod" }), ProductionHostError);
});

test("production + production host is allowed", () => {
  assert.doesNotThrow(() => assertAllowedHost("https://max.digitalcrew.tech", {}));
  assert.doesNotThrow(() => assertAllowedHost("https://max.digitalcrew.tech", { APP_ENV: "production" }));
});

test("staging + staging host is allowed", () => {
  const env = { APP_ENV: "staging" };
  assert.doesNotThrow(() => assertAllowedHost("https://max.digitalcrew-staging.tech", env));
  assert.doesNotThrow(() => assertAllowedHost("http://localhost:3006", env));
  assert.doesNotThrow(() => assertAllowedHost("https://abc.supabase.co", env));
});

test("startup check names every variable that points to production", () => {
  const env = {
    APP_ENV: "staging",
    NEXT_PUBLIC_AI_MAX_URL: "https://max.digitalcrew.tech",
    AUTH_ALLOWED_REDIRECT_DOMAINS: "digitalcrew-staging.tech, kate.digitalcrew.tech",
    DIGITALCREW_AUTH_COOKIE_DOMAIN: ".digitalcrew.tech",
    NEXT_PUBLIC_AI_KATE_URL: "https://kate.digitalcrew-staging.tech",
    REPORT_SENDER_EMAIL: "onboarding@digitalcrew.tech",
    SECRET_LIKE: "not-a-url",
    npm_package_homepage: "https://max.digitalcrew.tech",
  };
  assert.deepEqual(productionHostVariables(env), ["AUTH_ALLOWED_REDIRECT_DOMAINS", "DIGITALCREW_AUTH_COOKIE_DOMAIN", "NEXT_PUBLIC_AI_MAX_URL"]);
  assert.throws(() => assertNoProductionHostsInEnv(env), (error: unknown) => {
    assert.ok(error instanceof ProductionHostError);
    assert.match(error.message, /NEXT_PUBLIC_AI_MAX_URL/);
    assert.doesNotMatch(error.message, /https:\/\/max\.digitalcrew\.tech/, "values are not echoed");
    return true;
  });
  assert.doesNotThrow(() => assertNoProductionHostsInEnv({ ...env, APP_ENV: "production" }));
  assert.doesNotThrow(() => assertNoProductionHostsInEnv({ APP_ENV: "staging", NEXT_PUBLIC_AI_MAX_URL: "https://max.digitalcrew-staging.tech" }));
});

test("the fetch guard refuses production hosts before any network call", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input instanceof Request ? input.url : input));
    return new Response("ok");
  }) as typeof fetch;
  try {
    installProductionHostGuard({ APP_ENV: "production" });
    await globalThis.fetch("https://max.digitalcrew.tech/ping");
    assert.deepEqual(calls, ["https://max.digitalcrew.tech/ping"], "production is unchanged");

    installProductionHostGuard({ APP_ENV: "staging" });
    await assert.rejects(globalThis.fetch("https://max.digitalcrew.tech/ping"), ProductionHostError);
    await assert.rejects(globalThis.fetch(new Request("https://claire-api.digitalcrew.tech/x")), ProductionHostError);
    await assert.rejects(globalThis.fetch(new URL("https://www.digitalcrew.tech/api")), ProductionHostError);
    await globalThis.fetch("https://max.digitalcrew-staging.tech/ping");
    assert.deepEqual(calls, ["https://max.digitalcrew.tech/ping", "https://max.digitalcrew-staging.tech/ping"]);

    const once = globalThis.fetch;
    installProductionHostGuard({ APP_ENV: "staging" });
    assert.equal(globalThis.fetch, once, "installing twice does not wrap twice");
  } finally {
    globalThis.fetch = original;
  }
});

test("the Max base URL is refused outside production", async () => {
  const { getDigitalCrewBaseUrl } = await import("@/shared/http/digitalcrew-client");
  const saved = { APP_ENV: process.env.APP_ENV, DIGITALCREW_API_BASE_URL: process.env.DIGITALCREW_API_BASE_URL };
  try {
    process.env.DIGITALCREW_API_BASE_URL = "https://max.digitalcrew.tech/";
    delete process.env.APP_ENV;
    assert.equal(getDigitalCrewBaseUrl(), "https://max.digitalcrew.tech");
    process.env.APP_ENV = "staging";
    assert.throws(() => getDigitalCrewBaseUrl(), ProductionHostError);
    process.env.DIGITALCREW_API_BASE_URL = "https://max.digitalcrew-staging.tech";
    assert.equal(getDigitalCrewBaseUrl(), "https://max.digitalcrew-staging.tech");
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
