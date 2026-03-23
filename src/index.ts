import shellHtml from "./shell.html";

interface Env {
  ASSETS: Fetcher;
}

export interface TracePayload {
  ip: string;
  location: Record<string, string | number | undefined> | null;
  headers: Record<string, string>;
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp.trim();
  const trueClient = request.headers.get("True-Client-IP");
  if (trueClient) return trueClient.trim();
  const xff = request.headers.get("X-Forwarded-For");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") {
      out[k] = typeof v === "number" || typeof v === "string" ? v : String(v);
    }
  }
  return out;
}

function isIncomingCf(cf: CfProperties | undefined): cf is IncomingRequestCfProperties {
  return !!cf && "colo" in cf && "httpProtocol" in cf;
}

/** Documented on `request.cf` but not always present in `@cloudflare/workers-types`. */
const CF_TLS_FINGERPRINT_KEYS = [
  "tlsClientRandom",
  "tlsClientHelloLength",
  "tlsClientExtensionsSha1",
  "tlsClientExtensionsSha1Le",
  "tlsClientCiphersSha1",
] as const;

function cfOptionalStrings(
  cf: IncomingRequestCfProperties,
  keys: readonly string[],
): Record<string, string> {
  const raw = cf as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

function buildLocation(cf: CfProperties | undefined): Record<string, string | number> | null {
  if (!isIncomingCf(cf)) return null;
  const geo = {
    ...pickDefined({
      colo: cf.colo,
      country: cf.country,
      city: cf.city,
      region: cf.region,
      regionCode: cf.regionCode,
      postalCode: cf.postalCode,
      timezone: cf.timezone,
      latitude: cf.latitude,
      longitude: cf.longitude,
      continent: cf.continent,
      metroCode: cf.metroCode,
      isEUCountry: cf.isEUCountry,
      asn: cf.asn,
      asOrganization: cf.asOrganization,
      httpProtocol: cf.httpProtocol,
      tlsVersion: cf.tlsVersion,
      tlsCipher: cf.tlsCipher,
      clientAcceptEncoding: cf.clientAcceptEncoding,
      clientTcpRtt: cf.clientTcpRtt,
      edgeRequestKeepAliveStatus: cf.edgeRequestKeepAliveStatus,
      requestPriority: cf.requestPriority,
    }),
    ...cfOptionalStrings(cf, CF_TLS_FINGERPRINT_KEYS),
  };
  return Object.keys(geo).length ? geo : null;
}

function headersObject(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function json(data: TracePayload, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

function buildTracePayload(request: Request): TracePayload {
  return {
    ip: getClientIp(request),
    location: buildLocation(request.cf),
    headers: headersObject(request),
  };
}

function tracePlainText(payload: TracePayload): string {
  const lines: string[] = [];
  lines.push(`ip: ${payload.ip}`);
  lines.push("");
  if (payload.location && Object.keys(payload.location).length > 0) {
    lines.push("location:");
    for (const [k, v] of Object.entries(payload.location)) {
      lines.push(`  ${k}: ${v}`);
    }
  } else {
    lines.push("location: (none)");
  }
  lines.push("");
  lines.push("headers:");
  for (const [k, v] of Object.entries(payload.headers)) {
    lines.push(`  ${k}: ${v}`);
  }
  return lines.join("\n");
}

/** True when Accept lists text/html (typical browsers). Plain curl uses wildcard accept only. */
function wantsHtml(request: Request): boolean {
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("text/html");
}

function normalizePathname(pathname: string): string {
  if (pathname !== "/" && pathname.endsWith("/")) return pathname.slice(0, -1) || "/";
  return pathname;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePathname(url.pathname);

    if (path === "/api" || path === "/json") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const payload = buildTracePayload(request);
      if (request.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return json(payload);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "/") {
        const payload = buildTracePayload(request);
        if (wantsHtml(request)) {
          return new Response(request.method === "HEAD" ? null : shellHtml, {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        }
        if (request.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          });
        }
        return new Response(tracePlainText(payload), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }

      return new Response(request.method === "HEAD" ? null : shellHtml, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
