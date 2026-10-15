export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "body must be JSON");
  }
}

export function text(input: unknown, max: number): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

export function httpsUrlOrEmpty(input: unknown): string {
  const value = text(input, 2000);
  if (value === "") return "";
  try {
    if (new URL(value).protocol !== "https:") throw new Error();
  } catch {
    throw new HttpError(400, `${value.slice(0, 40)} is not an https URL`);
  }
  return value;
}
