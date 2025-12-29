// router.ts

import { allowOrigin, corsHeaders } from "../../_shared/cors.ts";

export type RouteParams = Record<string, string>;

export type RouteHandler = (
  req: Request,
  origin: string | null,
  params?: RouteParams,
) => Response | Promise<Response>;

interface RouteDef {
  method: string;
  path: string; // normalized (no leading/trailing slash)
  handler: RouteHandler;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, ""); // trim leading/trailing slashes
}

function matchPath(
  routePath: string,
  requestPath: string,
  params: RouteParams,
): boolean {
  const routeSegments = normalizePath(routePath).split("/").filter(Boolean);
  const requestSegments = normalizePath(requestPath).split("/").filter(Boolean);

  // Exact match only (same number of segments)
  if (routeSegments.length !== requestSegments.length) return false;

  for (let i = 0; i < routeSegments.length; i++) {
    const r = routeSegments[i];
    const u = requestSegments[i];

    if (r.startsWith(":")) {
      const name = r.slice(1);
      params[name] = decodeURIComponent(u);
    } else if (r !== u) {
      return false;
    }
  }

  return true;
}

export class Router {
  private routes: RouteDef[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    const normalized = normalizePath(path);
    this.routes.push({
      method: method.toUpperCase(),
      path: normalized,
      handler,
    });
  }

  /**
   * Mount a child router under a prefix.
   * Example:
   *   parent.use("scorecard", scorecardRouter)
   *   // child "list" -> "scorecard/list"
   */
  use(prefix: string, child: Router): void {
    const base = normalizePath(prefix);

    for (const r of child.getRoutes()) {
      const combinedPath = r.path
        ? `${base}/${r.path}`.replace(/\/+/g, "/")
        : base;

      this.routes.push({
        method: r.method,
        path: normalizePath(combinedPath),
        handler: r.handler,
      });
    }
  }

  getRoutes(): RouteDef[] {
    return [...this.routes];
  }

  async handle(
    method: string,
    path: string,
    req: Request,
    origin: string | null,
  ): Promise<Response | null> {
    const normalizedPath = normalizePath(path);
    const upperMethod = method.toUpperCase();

    // 🔹 Resolve allowed origin + base CORS headers once per request
    const resolvedOrigin = allowOrigin(origin);
    const baseCors = corsHeaders(resolvedOrigin);

    // 🔹 Global preflight handler: allow OPTIONS for any path
    if (upperMethod === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: baseCors,
      });
    }

    for (const route of this.routes) {
      if (route.method !== upperMethod) continue;

      const params: RouteParams = {};
      if (!matchPath(route.path, normalizedPath, params)) continue;

      // Let the route handler generate the base response
      const res = await route.handler(req, origin, params);

      // Merge existing headers with CORS headers
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(baseCors)) {
        headers.set(k, v);
      }

      return new Response(res.body, {
        status: res.status,
        headers,
      });
    }

    // No route matched: return null so the caller can decide (usually 404)
    return null;
  }
}
