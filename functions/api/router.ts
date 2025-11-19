export type Handler = (req: Request, origin: string | null) => Promise<Response> | Response;

export class Router {
  private map = new Map<string, Handler>();

  add(method: string, path: string, handler: Handler) {
    const key = this.key(method, path);
    this.map.set(key, handler);
  }

  async handle(method: string, path: string, req: Request): Promise<Response | undefined> {
    const key = this.key(method, path);
    const origin = req.headers.get("Origin");
    const h = this.map.get(key);
    if (!h) return undefined;
    return await h(req, origin);
  }

  private key(method: string, path: string) {
    return `${method.toUpperCase()} ${path || ""}`.trim();
  }
}
