/** Fetch-compatible function accepted by {@link FetchService}. */
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Performs JSON HTTP requests and rejects responses outside the successful range. */
export class FetchService {
  constructor(private readonly fetcher: Fetcher = (input, init) => fetch(input, init)) {}

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
