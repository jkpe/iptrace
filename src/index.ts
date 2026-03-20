import shellHtml from "./shell.html";

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

function buildLocation(cf: CfProperties | undefined): Record<string, string | number> | null {
  if (!isIncomingCf(cf)) return null;
  const geo = pickDefined({
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
  });
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

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);

    if (url.pathname === "/api") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const payload: TracePayload = {
        ip: getClientIp(request),
        location: buildLocation(request.cf),
        headers: headersObject(request),
      };
      if (request.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return json(payload);
    }

    if (request.method === "GET" || request.method === "HEAD") {
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
