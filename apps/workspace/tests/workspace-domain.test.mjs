import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import test from "node:test";
import {
  workspaceCookieName,
  workspaceCookieOptions,
} from "../src/server/session-policy.mjs";
import {
  legacyEntryResponse,
  legacyRefusedResponse,
} from "../src/server/legacy-entry.mjs";
import { sameOriginAllowed } from "../src/server/request-policy.mjs";
import { workspaceInvitationUrl } from "../src/server/workspace-address.mjs";

const hosted = { WOODRIGHT_WORKSPACE_RUNTIME: "hosted", PORT: "4320" };
const origin = "https://os.woodright.ru";
const policy = { WOODRIGHT_WORKSPACE_ORIGIN: origin };
const headersOf = (response) => new Headers(response.headers);

test("hosted root and legacy OS retain a dedicated session cookie name", () => {
  assert.equal(workspaceCookieName("", hosted), "wr_os");
  assert.equal(workspaceCookieName("/os", hosted), "wr_os");
  assert.equal(
    workspaceCookieName("/os", { WOODRIGHT_WORKSPACE_RUNTIME: "local-private", PORT: "4322" }),
    "wr_os_4322",
  );
  assert.equal(workspaceCookieName("", { WOODRIGHT_WORKSPACE_RUNTIME: "local-private" }), "wr_desk");
});

test("hosted root cookie is host-only, HttpOnly, Secure and Strict", () => {
  const options = workspaceCookieOptions(origin + "/api/live/login", "", hosted);
  assert.equal(options.path, "/");
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "strict");
  assert.equal(options.maxAge, 12 * 60 * 60);
  assert.equal(Object.keys(options).some((key) => key.toLowerCase() === "domain"), false);
  assert.equal(workspaceCookieOptions("https://woodright.ru/os/api/live/login", "/os", hosted).path, "/os");
});

test("the local HTTP exception cannot weaken hosted or non-local cookies", () => {
  const local = { WOODRIGHT_WORKSPACE_RUNTIME: "local-private" };
  for (const hostname of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.equal(workspaceCookieOptions(`http://${hostname}:4320/api/live/login`, "", local).secure, false);
    assert.equal(workspaceCookieOptions(`http://${hostname}:4320/api/live/login`, "", hosted).secure, true);
  }
  assert.equal(workspaceCookieOptions(origin + "/api/live/login", "", local).secure, true);
});

test("root and legacy builds resolve API, media and file URLs without external-path escapes", () => {
  for (const basePath of ["", "/os"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { workspacePath } from "./src/lib/paths.mjs";
      for (const suffix of ["/api/live/status", "/api/live/media/product-1", "/api/live/files/file-1", "/brand/woodright.svg"]) {
        assert.equal(workspacePath(suffix), ${JSON.stringify(basePath)} + suffix);
      }
      for (const escape of ["//outside.example/file", "https://outside.example/file", "relative"]) {
        assert.throws(() => workspacePath(escape));
      }
    `], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, NEXT_PUBLIC_WORKSPACE_BASE_PATH: basePath },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("only the exact configured new origin may submit same-origin writes", () => {
  const request = (actual, extra = {}) => new Request("http://localhost:4320/api/live/team", {
    headers: { ...(actual === null ? {} : { origin: actual }), ...extra },
  });
  assert.equal(sameOriginAllowed(request(origin, { "sec-fetch-site": "same-origin" }), policy), true);
  for (const rejected of [null, "null", "https://woodright.ru", "https://www.woodright.ru", "http://os.woodright.ru", "https://os.woodright.ru:444", "https://os.woodright.ru.attacker.example"]) {
    assert.equal(sameOriginAllowed(request(rejected, { "sec-fetch-site": "same-site", host: "os.woodright.ru" }), policy), false, String(rejected));
  }
});

test("a matching Origin never overrides an explicit cross-site request", () => {
  assert.equal(sameOriginAllowed(new Request("http://localhost:4320/api/live/team", {
    headers: { origin, "sec-fetch-site": "cross-site", host: "os.woodright.ru" },
  }), policy), false);
});

test("invitations preserve opaque tokens in the fragment on the exact configured root or legacy address", () => {
  const token = "opaque.fake/token?x=1&next=https://outside.example#part";
  const expectedToken = encodeURIComponent(token);
  assert.equal(workspaceInvitationUrl(origin, "", token), origin + "/#/join/" + expectedToken);
  assert.equal(workspaceInvitationUrl("https://woodright.ru", "/os", token), "https://woodright.ru/os/#/join/" + expectedToken);
  assert.equal(new URL(workspaceInvitationUrl(origin, "", token)).search, "");
  for (const invalidOrigin of [origin + "/return", origin + "?return=https://outside.example", origin + "#fragment", "https://user:password@os.woodright.ru", "javascript:alert(1)"]) {
    assert.throws(() => workspaceInvitationUrl(invalidOrigin, "", token));
  }
  for (const invalidPath of ["/other", "//outside.example", "/os/", "https://outside.example"]) {
    assert.throws(() => workspaceInvitationUrl(origin, invalidPath, token));
  }
  assert.throws(() => workspaceInvitationUrl(origin, "", ""));
});

function executeLegacyBridge(response, hash) {
  const match = response.body.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "legacy entry must contain its explicit fragment bridge");
  const destinations = [];
  const location = {
    hash,
    replace(value) { destinations.push(String(value)); },
    assign(value) { destinations.push(String(value)); },
    set href(value) { destinations.push(String(value)); },
  };
  vm.runInNewContext(match[1], { window: { location }, location }, { timeout: 100 });
  assert.equal(destinations.length, 1);
  return destinations[0];
}

test("legacy HTML transfers only the hash to the fixed OS root, including old invitation bookmarks", () => {
  const response = legacyEntryResponse("workspace-domain-test-nonce");
  assert.equal(response.status, 200);
  for (const hash of ["", "#/requests/request-1", "#/join/opaque.fake%2Ftoken", "#//outside.example/?return=https://evil.example"]) {
    assert.equal(executeLegacyBridge(response, hash), origin + "/" + hash);
  }
});

test("legacy entry permits only its nonce script and stays private and uncacheable", () => {
  const nonce = "workspace-domain-test-nonce";
  const response = legacyEntryResponse(nonce);
  const headers = headersOf(response);
  assert.match(headers.get("content-security-policy") || "", new RegExp(`'nonce-${nonce}'`));
  assert.doesNotMatch(headers.get("content-security-policy") || "", /unsafe-inline/);
  assert.match(response.body, new RegExp(`<script\\b[^>]*nonce=["']${nonce}["']`));
  assert.match(headers.get("cache-control") || "", /no-store/);
  assert.match(headers.get("x-robots-tag") || "", /noindex/);
  assert.equal(headers.has("set-cookie"), false);
});

test("retired API responses refuse the operation without redirects or session forwarding", () => {
  const response = legacyRefusedResponse();
  const headers = headersOf(response);
  assert.equal(response.status, 410);
  assert.match(headers.get("content-type") || "", /application\/json/);
  assert.match(headers.get("cache-control") || "", /no-store/);
  assert.match(headers.get("x-robots-tag") || "", /noindex/);
  assert.equal(headers.has("location"), false);
  assert.equal(headers.has("set-cookie"), false);
  assert.ok(JSON.parse(response.body));
  assert.match(response.body, /https:\/\/os\.woodright\.ru/);
});
