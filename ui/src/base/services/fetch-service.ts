/** Fetch-compatible function accepted by {@link FetchService}. */
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Error raised for an unsuccessful HTTP response. */
export class FetchError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
  ) {
    super(`${method} ${path} failed with HTTP ${status}`);
    this.name = "FetchError";
  }
}

/** Performs JSON HTTP requests and rejects responses outside the successful range. */
export class FetchService {
  private artificialDelay = 0;
  private unauthorizedListeners = new Set<() => void>();

  constructor(private readonly fetcher: Fetcher = (input, init) => fetch(input, init)) {}

  /** Returns the artificial delay applied before each request. */
  artificialDelayMs(): number {
    return this.artificialDelay;
  }

  /** Sets a non-negative artificial delay applied before each request. */
  setArtificialDelayMs(delay: number): void {
    if (!Number.isFinite(delay) || delay < 0) throw new Error("Artificial fetch delay must be a non-negative number");
    this.artificialDelay = delay;
  }

  /** Subscribes to expired or invalid session responses. */
  onUnauthorized(listener: () => void): () => void {
    this.unauthorizedListeners.add(listener);
    return () => this.unauthorizedListeners.delete(listener);
  }

  /** Fetches and decodes a JSON resource. */
  get(path: string): Promise<unknown> {
    return this.request(path, { method: "GET" });
  }

  /** Serializes a request body as JSON and decodes the JSON response. */
  post(path: string, body: unknown): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    if (this.artificialDelay > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, this.artificialDelay));
    }
    const response = await this.fetcher(path, init);
    if (!response.ok) {
      if (response.status === 401) {
        for (const listener of this.unauthorizedListeners) listener();
      }
      throw new FetchError(init.method ?? "GET", path, response.status);
    }
    return response.json();
  }
}

/** Default browser-backed fetch service used by the application. */
export const fetchService = new FetchService();
/** Service key for the shared {@link FetchService}. */
export const fetchServiceKey = serviceKey<FetchService>("fetch-service");
import { serviceKey } from "../service-registry";
