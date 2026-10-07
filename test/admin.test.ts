import assert from "node:assert/strict";
import test from "node:test";
import { OWNER_EMAIL, sessionCookie } from "../functions/_shared/admin.ts";
import {
  handlePasswordRecoveryRequest,
  handlePasswordRecoveryUpdate,
  handlePasswordRecoveryVerification,
} from "../functions/_shared/recovery.ts";
import { handleImageUpload } from "../functions/api/admin/images.ts";
import { handlePlateRequest } from "../functions/api/admin/plates/[id].ts";
import { handlePlatesRequest } from "../functions/api/admin/plates.ts";
import { handleSessionRequest } from "../functions/api/admin/session.ts";
import { handleTodayAdminRequest } from "../functions/api/admin/plates/today.ts";
import type { Env } from "../functions/_shared/config.ts";

const env: Env = {
  SUPABASE_URL: "https://cottage44-test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_for_tests",
  ADMIN_SITE_URL: "https://menu.example",
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function readCookiePayload(setCookie: string): Record<string, unknown> {
  const encoded = setCookie.split(";")[0].split("=")[1];
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
}

function sessionRequest(
  rememberMe: boolean,
  url = "https://menu.example/api/admin/session",
): Request {
  const cookie = sessionCookie(new Request(url), {
    accessToken: "access-test-token",
    refreshToken: "refresh-test-token",
    rememberMe,
  });
  return new Request(url, {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

test("password sign-in sets a secure HttpOnly cookie for the selected duration, never returns tokens", async () => {
  for (const [rememberMe, expectedAge] of [
    [true, "2592000"],
    [false, null],
  ] as const) {
    const request = new Request("https://menu.example/api/admin/session", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: OWNER_EMAIL,
        password: "test-password",
        rememberMe,
      }),
    });
    const response = await handleSessionRequest(request, env, {
      fetchImpl: async () =>
        jsonResponse({
          access_token: "access-secret-test",
          refresh_token: "refresh-secret-test",
          user: { email: OWNER_EMAIL },
        }),
    });
    const cookie = response.headers.get("Set-Cookie") ?? "";
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      authenticated: true,
      email: OWNER_EMAIL,
    });
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/admin/);
    if (expectedAge) {
      assert.match(cookie, new RegExp(`Max-Age=${expectedAge}`));
    } else {
      assert.doesNotMatch(cookie, /Max-Age=/);
    }
    assert.doesNotMatch(cookie, /; ?(access|refresh)-token=/i);
    assert.deepEqual(readCookiePayload(cookie), {
      accessToken: "access-secret-test",
      refreshToken: "refresh-secret-test",
      rememberMe,
    });
    assert.doesNotMatch(JSON.stringify(body), /access-secret|refresh-secret/);
  }
});

test("sign-in rejects non-owner emails and cross-origin requests before contacting Supabase", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return jsonResponse({});
  };
  const wrongEmail = await handleSessionRequest(
    new Request("https://menu.example/api/admin/session", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "attacker@example.com",
        password: "not-a-password",
      }),
    }),
    env,
    { fetchImpl },
  );
  const crossOrigin = await handleSessionRequest(
    new Request("https://menu.example/api/admin/session", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: OWNER_EMAIL,
        password: "not-a-password",
      }),
    }),
    env,
    { fetchImpl },
  );

  assert.equal(wrongEmail.status, 401);
  assert.equal(crossOrigin.status, 403);
  assert.equal(fetchCalls, 0);
});

function recoveryRequest(
  path: string,
  body: unknown,
  url = `https://menu.example${path}`,
): Request {
  const origin = new URL(url).origin;
  return new Request(url, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("password reset requests do not reveal whether an email belongs to the owner", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)),
    });
    return jsonResponse({});
  };
  const ownerResponse = await handlePasswordRecoveryRequest(
    recoveryRequest("/api/admin/password-recovery", { email: OWNER_EMAIL }),
    env,
    { fetchImpl },
  );
  const otherResponse = await handlePasswordRecoveryRequest(
    recoveryRequest("/api/admin/password-recovery", { email: "person@example.com" }),
    env,
    { fetchImpl },
  );
  const ownerBody = await ownerResponse.json();
  const otherBody = await otherResponse.json();

  assert.equal(ownerResponse.status, 200);
  assert.equal(otherResponse.status, 200);
  assert.deepEqual(ownerBody, otherBody);
  assert.match(ownerBody.message, /if the address belongs to the owner/i);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/recover\?redirect_to=/);
  const redirect = new URLSearchParams(new URL(calls[0].url).search).get("redirect_to");
  assert.equal(redirect, "https://menu.example/api/admin/password-recovery/verify");
  assert.deepEqual(calls[0].body, { email: OWNER_EMAIL });
});

test("password reset provider failures return a generic error and log only the HTTP status", async () => {
  for (const status of [400, 429, 500]) {
    const secretDetails = {
      code: "over_email_send_rate_limit",
      message: `Email ${OWNER_EMAIL} token sensitive-provider-detail`,
    };
    const logs: string[] = [];
    let fetchCalls = 0;
    const response = await handlePasswordRecoveryRequest(
      recoveryRequest("/api/admin/password-recovery", { email: OWNER_EMAIL }),
      env,
      {
        logger: { error: (message) => logs.push(message) },
        fetchImpl: async () => {
          fetchCalls += 1;
          return jsonResponse(secretDetails, status);
        },
      },
    );
    const body = await response.json();

    assert.equal(fetchCalls, 1);
    assert.equal(response.status, 503);
    assert.deepEqual(body, {
      error: {
        code: "RECOVERY_REQUEST_FAILED",
        message:
          "We couldn't process the password reset request right now. Please wait before trying again.",
      },
    });
    assert.equal(logs.length, 1);
    assert.equal(
      logs[0],
      `[admin] Supabase recovery request failed with HTTP ${status}.`,
    );
    assert.doesNotMatch(
      JSON.stringify(body),
      /over_email_send_rate_limit|sensitive-provider-detail|corne\.dawson/,
    );
    assert.doesNotMatch(
      logs.join("\n"),
      /over_email_send_rate_limit|sensitive-provider-detail|corne\.dawson/,
    );
  }
});

test("password reset provider success keeps the generic non-enumerating response", async () => {
  let fetchCalls = 0;
  const response = await handlePasswordRecoveryRequest(
    recoveryRequest("/api/admin/password-recovery", { email: OWNER_EMAIL }),
    env,
    {
      logger: { error: () => assert.fail("Successful provider request must not be logged") },
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse({}, 200);
      },
    },
  );

  assert.equal(fetchCalls, 1);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message:
      "If the address belongs to the owner account, a password reset email will arrive shortly. Check the inbox and spam folder.",
  });
});

test("password reset transport failure returns a safe retry-later response", async () => {
  const logs: string[] = [];
  const response = await handlePasswordRecoveryRequest(
    recoveryRequest("/api/admin/password-recovery", { email: OWNER_EMAIL }),
    env,
    {
      logger: { error: (message) => logs.push(message) },
      fetchImpl: async () => {
        throw new Error(`private network detail for ${OWNER_EMAIL}`);
      },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.error.message, /couldn't process the password reset request/i);
  assert.equal(
    logs[0],
    "[admin] Supabase recovery request failed before receiving a response.",
  );
  assert.doesNotMatch(logs.join("\n"), /private network detail|corne\.dawson/);
});

test("password reset uses the current trusted Cloudflare preview host without per-preview configuration", async () => {
  const previewEnv: Env = {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
  };
  const previewUrl =
    "https://a110bed2.cottage44-menu-pages.pages.dev/api/admin/password-recovery";
  let fetchCalls = 0;
  let resetRedirect = "";
  const response = await handlePasswordRecoveryRequest(
    recoveryRequest("/api/admin/password-recovery", { email: OWNER_EMAIL }, previewUrl),
    previewEnv,
    {
      fetchImpl: async (input) => {
        fetchCalls += 1;
        resetRedirect =
          new URLSearchParams(new URL(String(input)).search).get("redirect_to") ?? "";
        return jsonResponse({});
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(
    resetRedirect,
    "https://a110bed2.cottage44-menu-pages.pages.dev/api/admin/password-recovery/verify",
  );
});

test("password recovery fails safely for unconfigured custom hosts without contacting Supabase", async () => {
  const previewEnv: Env = {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
  };
  let fetchCalls = 0;
  const response = await handlePasswordRecoveryRequest(
    recoveryRequest(
      "/api/admin/password-recovery",
      { email: OWNER_EMAIL },
      "https://unconfigured.example/api/admin/password-recovery",
    ),
    previewEnv,
    { fetchImpl: async () => { fetchCalls += 1; return jsonResponse({}); } },
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(body, { error: "Forbidden." });
  assert.equal(fetchCalls, 0);
});

test("password recovery reports missing Supabase configuration with a safe nested error", async () => {
  const response = await handlePasswordRecoveryRequest(
    recoveryRequest(
      "/api/admin/password-recovery",
      { email: OWNER_EMAIL },
      "https://a110bed2.cottage44-menu-pages.pages.dev/api/admin/password-recovery",
    ),
    {},
    {
      logger: { error() {} },
      fetchImpl: async () => { throw new Error("Should not call Supabase"); },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
    },
  });
});

test("recovery verification exchanges Supabase's recovery OTP server-side and sets a short HttpOnly cookie", async () => {
  let upstreamUrl = "";
  let upstreamBody: unknown;
  const response = await handlePasswordRecoveryVerification(
    new Request(
      "https://menu.example/api/admin/password-recovery/verify?token_hash=opaque-hash&type=recovery",
    ),
    env,
    {
      fetchImpl: async (input, init) => {
        upstreamUrl = String(input);
        upstreamBody = JSON.parse(String(init?.body));
        return jsonResponse({
          access_token: "recovery-access",
          refresh_token: "recovery-refresh",
          user: { email: OWNER_EMAIL },
        });
      },
    },
  );
  const cookie = response.headers.get("Set-Cookie") ?? "";

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "https://menu.example/admin/?recovery=ready");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(cookie, /^c44_recovery=/);
  assert.match(cookie, /Path=\/api\/admin\/password-recovery/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=600/);
  assert.equal(upstreamUrl, `${env.SUPABASE_URL}/auth/v1/verify`);
  assert.deepEqual(upstreamBody, { token_hash: "opaque-hash", type: "recovery" });
  assert.doesNotMatch(response.headers.get("Location") ?? "", /opaque-hash|access-token/);
});

test("recovery verification rejects invalid token types and non-owner sessions", async () => {
  let fetchCalls = 0;
  const invalidType = await handlePasswordRecoveryVerification(
    new Request(
      "https://menu.example/api/admin/password-recovery/verify?token_hash=opaque-hash&type=signup",
    ),
    env,
    { fetchImpl: async () => { fetchCalls += 1; return jsonResponse({}); } },
  );
  const wrongOwner = await handlePasswordRecoveryVerification(
    new Request(
      "https://menu.example/api/admin/password-recovery/verify?token_hash=opaque-hash&type=recovery",
    ),
    env,
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse({
          access_token: "attacker-access",
          refresh_token: "attacker-refresh",
          user: { email: "person@example.com" },
        });
      },
    },
  );

  assert.equal(invalidType.status, 303);
  assert.equal(invalidType.headers.get("Location"), "https://menu.example/admin/?recovery=invalid");
  assert.equal(wrongOwner.status, 303);
  assert.equal(wrongOwner.headers.get("Set-Cookie"), null);
  assert.equal(fetchCalls, 1);
});

test("password update revalidates the owner recovery session and clears it after success", async () => {
  const verified = await handlePasswordRecoveryVerification(
    new Request(
      "https://menu.example/api/admin/password-recovery/verify?token_hash=opaque-hash&type=recovery",
    ),
    env,
    {
      fetchImpl: async () =>
        jsonResponse({
          access_token: "recovery-access",
          refresh_token: "recovery-refresh",
          user: { email: OWNER_EMAIL },
        }),
    },
  );
  const cookie = verified.headers.get("Set-Cookie")?.split(";")[0] ?? "";
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const update = await handlePasswordRecoveryUpdate(
    new Request("https://menu.example/api/admin/password-recovery/update", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "new-owner-password" }),
    }),
    env,
    {
      fetchImpl: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? "GET",
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        if (String(input).endsWith("/auth/v1/user") && !init?.method) {
          return jsonResponse({ email: OWNER_EMAIL });
        }
        return jsonResponse({ id: "owner-user" });
      },
    },
  );

  assert.equal(update.status, 200);
  assert.deepEqual(await update.json(), { updated: true });
  assert.match(update.headers.get("Set-Cookie") ?? "", /Max-Age=0/);
  assert.deepEqual(calls, [
    {
      url: `${env.SUPABASE_URL}/auth/v1/user`,
      method: "GET",
    },
    {
      url: `${env.SUPABASE_URL}/auth/v1/user`,
      method: "PUT",
      body: { password: "new-owner-password" },
    },
  ]);
});

test("password update refuses expired recovery sessions before contacting the user update endpoint", async () => {
  let updateCalled = false;
  const response = await handlePasswordRecoveryUpdate(
    new Request("https://menu.example/api/admin/password-recovery/update", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        Cookie: "c44_recovery=invalid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "new-owner-password" }),
    }),
    env,
    {
      fetchImpl: async (input) => {
        if (String(input).endsWith("/auth/v1/user")) {
          return jsonResponse({ error: "expired" }, 401);
        }
        updateCalled = true;
        return jsonResponse({});
      },
    },
  );

  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /reset link has expired/i);
  assert.match(response.headers.get("Set-Cookie") ?? "", /Max-Age=0/);
  assert.equal(updateCalled, false);
});

test("recovery endpoints reject an unapproved site origin", async () => {
  let fetchCalled = false;
  const response = await handlePasswordRecoveryRequest(
    new Request("https://attacker.example/api/admin/password-recovery", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: OWNER_EMAIL }),
    }),
    env,
    { fetchImpl: async () => { fetchCalled = true; return jsonResponse({}); } },
  );

  assert.equal(response.status, 403);
  assert.equal(fetchCalled, false);
});

test("a remembered session keeps its 30-day cookie when Supabase refreshes tokens", async () => {
  const request = sessionRequest(true);
  const response = await handleSessionRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ message: "expired" }, 401);
      }
      return jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        user: { email: OWNER_EMAIL },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    email: OWNER_EMAIL,
  });
  assert.match(response.headers.get("Set-Cookie") ?? "", /Max-Age=2592000/);
  assert.equal(readCookiePayload(response.headers.get("Set-Cookie") ?? "").rememberMe, true);
});

test("an unchecked session remains a browser-session cookie when Supabase refreshes tokens", async () => {
  const request = sessionRequest(false);
  const response = await handleSessionRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ message: "expired" }, 401);
      }
      return jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        user: { email: OWNER_EMAIL },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers.get("Set-Cookie") ?? "", /Max-Age=|Expires=/);
  assert.equal(readCookiePayload(response.headers.get("Set-Cookie") ?? "").rememberMe, false);
});

test("image upload rejects cross-origin, unsupported, and signature-mismatched content", async () => {
  const forged = await handleImageUpload(
    new Request("https://menu.example/api/admin/images", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        Cookie: sessionRequest(false).headers.get("Cookie") ?? "",
        "Content-Type": "image/png",
      },
      body: new ArrayBuffer(3),
    }),
    env,
    { fetchImpl: async () => jsonResponse({ email: OWNER_EMAIL }) },
  );
  const crossOrigin = await handleImageUpload(
    new Request("https://menu.example/api/admin/images", {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Content-Type": "image/jpeg" },
      body: new ArrayBuffer(3),
    }),
    env,
  );
  const unsupported = await handleImageUpload(
    new Request("https://menu.example/api/admin/images", {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        "Content-Type": "image/svg+xml",
      },
      body: new ArrayBuffer(3),
    }),
    env,
  );

  assert.equal(forged.status, 400);
  assert.equal(crossOrigin.status, 403);
  assert.equal(unsupported.status, 415);
});

test("valid image upload uses an opaque generated object key and fixed public bucket URL", async () => {
  const request = sessionRequest(false, "https://menu.example/api/admin/images");
  const body = new ArrayBuffer(6);
  new Uint8Array(body).set([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]);
  const uploadRequest = new Request(request.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: request.headers.get("Cookie") ?? "",
      "Content-Type": "image/jpeg",
    },
    body,
  });
  let objectPath = "";
  let uploadedContentType = "";
  const response = await handleImageUpload(uploadRequest, env, {
    fetchImpl: async (input, init) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      objectPath = new URL(String(input)).pathname;
      uploadedContentType = new Headers(init?.headers).get("Content-Type") ?? "";
      return jsonResponse({ Key: "not-used" });
    },
  });

  assert.equal(response.status, 200);
  const { imageUrl } = await response.json() as { imageUrl: string };
  assert.match(objectPath, /^\/storage\/v1\/object\/cottage44-plates\/[0-9a-f-]{36}\.jpg$/i);
  assert.equal(uploadedContentType, "image/jpeg");
  assert.match(imageUrl, /^https:\/\/cottage44-test\.supabase\.co\/storage\/v1\/object\/public\/cottage44-plates\/[0-9a-f-]{36}\.jpg$/i);
});

test("image upload accepts valid phone-image metadata and trailing bytes", async () => {
  const cookieRequest = sessionRequest(false, "https://menu.example/api/admin/images");
  const body = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x58,
    0xff, 0xd9, 0x00, 0x00, 0x00,
  ]);
  const request = new Request(cookieRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: cookieRequest.headers.get("Cookie") ?? "",
      "Content-Type": "image/jpeg",
    },
    body,
  });
  let storageCalled = false;
  const response = await handleImageUpload(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      storageCalled = true;
      return jsonResponse({});
    },
  });

  assert.equal(response.status, 200);
  assert.equal(storageCalled, true);
});

test("image upload enforces the 5 MiB cap even when Content-Length is absent", async () => {
  const cookieRequest = sessionRequest(false, "https://menu.example/api/admin/images");
  const oversizedBody = new ArrayBuffer(5 * 1024 * 1024 + 1);
  const request = new Request(cookieRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: cookieRequest.headers.get("Cookie") ?? "",
      "Content-Type": "image/jpeg",
    },
    body: oversizedBody,
  });
  let storageCalled = false;
  const response = await handleImageUpload(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      storageCalled = true;
      return jsonResponse({});
    },
  });

  assert.equal(response.status, 400);
  assert.equal(storageCalled, false);
});

test("setting today's plate uses the server's Johannesburg date and the authenticated token", async () => {
  const cookieRequest = sessionRequest(false, "https://menu.example/api/admin/plates/today");
  const request = new Request(cookieRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: cookieRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plateId: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0" }),
  });

  let authorization = "";
  let requestPayload: unknown;
  const response = await handleTodayAdminRequest(
    request,
    env,
    {
      fetchImpl: async (input, init) => {
        if (String(input).endsWith("/auth/v1/user")) {
          return jsonResponse({ email: OWNER_EMAIL });
        }
        authorization = new Headers(init?.headers).get("Authorization") ?? "";
        requestPayload = JSON.parse(String(init?.body));
        return jsonResponse([
          {
            service_date: "2026-10-07",
            plate: {
              id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
              name: "Today's plate",
              description: "Fresh",
              price_cents: 12500,
              image_url: null,
            },
          },
        ]);
      },
    },
    new Date("2026-10-06T22:00:00.000Z"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(requestPayload, {
    service_date: "2026-10-07",
    plate_id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
  });
  assert.equal(authorization, "Bearer access-test-token");
  assert.deepEqual(await response.json(), {
    today: {
      serviceDate: "2026-10-07",
      plate: {
        id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
        name: "Today's plate",
        description: "Fresh",
        priceCents: 12500,
        imageUrl: null,
      },
    },
  });
});

test("owner can plan a saved plate for a future service date", async () => {
  const cookieRequest = sessionRequest(false, "https://menu.example/api/admin/plates/today");
  const request = new Request(cookieRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: cookieRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serviceDate: "2026-10-09",
      plateId: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
    }),
  });
  let requestPayload: unknown;
  const response = await handleTodayAdminRequest(
    request,
    env,
    {
      fetchImpl: async (input, init) => {
        if (String(input).endsWith("/auth/v1/user")) {
          return jsonResponse({ email: OWNER_EMAIL });
        }
        requestPayload = JSON.parse(String(init?.body));
        return jsonResponse([{
          service_date: "2026-10-09",
          plate: {
            id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
            name: "Friday plate",
            description: "Fresh",
            price_cents: 12500,
            image_url: null,
          },
        }]);
      },
    },
    new Date("2026-10-06T22:00:00.000Z"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(requestPayload, {
    service_date: "2026-10-09",
    plate_id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
  });
  assert.equal((await response.json()).today.serviceDate, "2026-10-09");
});

test("owner can clear a planned date without replacing it with another plate", async () => {
  const cookieRequest = sessionRequest(false, "https://menu.example/api/admin/plates/today");
  const request = new Request(cookieRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: cookieRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ serviceDate: "2026-10-09", plateId: null }),
  });
  let databaseUrl = "";
  let databaseMethod = "";
  let preferHeader = "";
  const response = await handleTodayAdminRequest(
    request,
    env,
    {
      fetchImpl: async (input, init) => {
        if (String(input).endsWith("/auth/v1/user")) {
          return jsonResponse({ email: OWNER_EMAIL });
        }
        databaseUrl = String(input);
        databaseMethod = init?.method ?? "";
        preferHeader = new Headers(init?.headers).get("Prefer") ?? "";
        return jsonResponse([{ service_date: "2026-10-09" }]);
      },
    },
    new Date("2026-10-06T22:00:00.000Z"),
  );
  assert.equal(response.status, 200);
  assert.equal(databaseMethod, "DELETE");
  const query = new URL(databaseUrl).searchParams;
  assert.equal(query.get("service_date"), "eq.2026-10-09");
  assert.equal(query.get("select"), "service_date");
  assert.equal(preferHeader, "return=representation");
  assert.deepEqual(await response.json(), {
    cleared: true,
    serviceDate: "2026-10-09",
  });
});

test("clearing an already-unscheduled date is successful and database failures are explicit", async () => {
  const makeRequest = () => {
    const baseRequest = sessionRequest(false, "https://menu.example/api/admin/plates/today");
    return new Request(baseRequest.url, {
      method: "POST",
      headers: {
        Origin: "https://menu.example",
        Cookie: baseRequest.headers.get("Cookie") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ serviceDate: "2026-10-09", plateId: null }),
    });
  };
  const request = makeRequest();
  const noOpResponse = await handleTodayAdminRequest(request, env, {
    fetchImpl: async (input) => String(input).endsWith("/auth/v1/user")
      ? jsonResponse({ email: OWNER_EMAIL })
      : jsonResponse([]),
  }, new Date("2026-10-06T22:00:00.000Z"));
  assert.equal(noOpResponse.status, 200);
  assert.deepEqual(await noOpResponse.json(), {
    cleared: true,
    serviceDate: "2026-10-09",
  });

  const failedResponse = await handleTodayAdminRequest(makeRequest(), env, {
    fetchImpl: async (input) => String(input).endsWith("/auth/v1/user")
      ? jsonResponse({ email: OWNER_EMAIL })
      : jsonResponse({ message: "permission denied" }, 403),
  }, new Date("2026-10-06T22:00:00.000Z"));
  assert.equal(failedResponse.status, 503);
  assert.match((await failedResponse.json()).error, /latest database migration/);
});

test("owner planning rejects dates beyond the one-year window", async () => {
  const baseRequest = sessionRequest(false, "https://menu.example/api/admin/plates/today");
  const request = new Request(baseRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: baseRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serviceDate: "2028-01-01",
      plateId: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
    }),
  });
  let databaseCalled = false;
  const response = await handleTodayAdminRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      databaseCalled = true;
      return jsonResponse([]);
    },
  }, new Date("2026-10-06T22:00:00.000Z"));
  assert.equal(response.status, 400);
  assert.equal(databaseCalled, false);
});

test("future assignment failures identify an unapplied planning migration without exposing provider details", async () => {
  const baseRequest = sessionRequest(false, "https://menu.example/api/admin/plates/today");
  const request = new Request(baseRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: baseRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serviceDate: "2026-10-08",
      plateId: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
    }),
  });
  const response = await handleTodayAdminRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      return jsonResponse({ message: "permission denied: secret provider detail" }, 403);
    },
  }, new Date("2026-10-07T00:00:00.000Z"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Future planning is not enabled yet. Please ask the site administrator to apply the latest database migration, then try again.",
  });
});

test("owner plate creation forwards validated fields with the Supabase user token", async () => {
  const baseRequest = sessionRequest(false, "https://menu.example/api/admin/plates");
  const request = new Request(baseRequest.url, {
    method: "POST",
    headers: {
      Origin: "https://menu.example",
      Cookie: baseRequest.headers.get("Cookie") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "  Cottage burger ",
      description: "Beef and chips",
      priceCents: 12500,
      imageUrl: null,
    }),
  });
  let databasePayload: unknown;
  let authorization = "";
  const response = await handlePlatesRequest(request, env, {
    fetchImpl: async (input, init) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({ email: OWNER_EMAIL });
      }
      databasePayload = JSON.parse(String(init?.body));
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return jsonResponse([
        {
          id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
          name: "Cottage burger",
          description: "Beef and chips",
          price_cents: 12500,
          image_url: null,
          created_at: "2026-10-07T10:00:00.000Z",
          updated_at: "2026-10-07T10:00:00.000Z",
        },
      ]);
    },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(databasePayload, {
    name: "Cottage burger",
    description: "Beef and chips",
    price_cents: 12500,
    image_url: null,
  });
  assert.equal(authorization, "Bearer access-test-token");
  assert.equal((await response.json() as { plate: { name: string } }).plate.name, "Cottage burger");
});

test("admin API does not accept user metadata as owner identity", async () => {
  const request = sessionRequest(false, "https://menu.example/api/admin/plates");
  let databaseCalled = false;
  const response = await handlePlatesRequest(request, env, {
    fetchImpl: async (input) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return jsonResponse({
          email: "attacker@example.com",
          user_metadata: { email: OWNER_EMAIL },
        });
      }
      databaseCalled = true;
      return jsonResponse([]);
    },
  });

  assert.equal(response.status, 401);
  assert.equal(databaseCalled, false);
});

test("plate update and deletion require a same-origin mutation", async () => {
  let fetchCalled = false;
  const request = new Request("https://menu.example/api/admin/plates/8d2b48f2-7932-4ff0-9e80-7ac5efc438f0", {
    method: "DELETE",
    headers: { Origin: "https://attacker.example" },
  });
  const response = await handlePlateRequest(
    request,
    env,
    "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
    {
      fetchImpl: async () => {
        fetchCalled = true;
        return jsonResponse({});
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(fetchCalled, false);
});
