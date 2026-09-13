/** Fetch-compatible function accepted by {@link FetchService}. */
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Performs JSON HTTP requests and rejects responses outside the successful range. */
export class FetchService {
  private artificialDelay = 0;

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
      throw new Error(`${init.method} ${path} failed with HTTP ${response.status}`);
    }
    return response.json();
  }
}

/** Default browser-backed fetch service used by the application. */
export const fetchService = new FetchService();
/** Service key for the shared {@link FetchService}. */
export const fetchServiceKey = serviceKey<FetchService>("fetch-service");
import { serviceKey } from "../service-registry";
