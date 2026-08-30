import type { PlaygroundDemo } from "./demo";

export interface PlaygroundSelection {
  readonly demo: PlaygroundDemo;
  readonly scenarioName: string;
}

export function playgroundHash(demoId: string, scenarioName: string): string {
  return `#playground/${encodeURIComponent(demoId)}/${encodeURIComponent(scenarioName)}`;
}

export function isPlaygroundHash(hash: string): boolean {
  return hash === "#playground" || hash.startsWith("#playground/");
}

export function selectPlaygroundRoute(
  hash: string,
  library: readonly PlaygroundDemo[],
): PlaygroundSelection | undefined {
  if (library.length === 0) return undefined;
  const match = hash.match(/^#playground\/([^/]+)\/([^/]+)$/);
  if (match) {
    try {
      const demoId = decodeURIComponent(match[1]);
      const scenarioName = decodeURIComponent(match[2]);
      const demo = library.find((candidate) => candidate.id === demoId);
      if (demo?.scenarios.some((scenario) => scenario.name === scenarioName)) return { demo, scenarioName };
    } catch {
      // Malformed user-edited hashes use the same canonical fallback as stale routes.
    }
  }
  return { demo: library[0], scenarioName: library[0].scenarios[0].name };
}
