export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class FetchService {
  constructor(private readonly fetcher: Fetcher = (input, init) => fetch(input, init)) {}

  get(path: string): Promise<unknown> {
    return this.request(path, { method: "GET" });
  }

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

export const fetchService = new FetchService();
export const fetchServiceKey = serviceKey<FetchService>("fetch-service");
import { serviceKey } from "../plugins/services";
