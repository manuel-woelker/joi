import { createSignal, Show } from "solid-js";

import type { ComponentDemo } from "../../plugins/core/playground/demo";
import { GitHistory } from "./GitHistory";
import type { GitHistoryCommit, GitHistoryPage, GitHistorySource } from "./git-history";

const now = new Date("2026-09-13T12:00:00Z");
const commits: GitHistoryCommit[] = [
  commit(
    "f4adfb8123456789",
    ["dafdb2d123456789"],
    "Initialize repository configuration",
    "Mara Chen",
    "2026-09-13T11:42:00Z",
  ),
  commit(
    "dafdb2d123456789",
    ["1ff9841123456789", "4d5e134123456789"],
    "Split domain plugins from server\n\nMove Codevette into its own crate.",
    "Noah Williams",
    "2026-09-13T08:15:00Z",
  ),
  commit(
    "4d5e134123456789",
    ["5364e66123456789"],
    "Distinguish close and delete icons",
    "Mara Chen",
    "2026-09-12T17:30:00Z",
  ),
  commit(
    "1ff9841123456789",
    ["5364e66123456789"],
    "Add repository management plugins",
    "Iris Okafor",
    "2026-09-12T15:20:00Z",
  ),
  commit("5364e66123456789", [], "Align entity toolbar with table", "Noah Williams", "2026-09-10T09:00:00Z"),
];

const complexCommits: GitHistoryCommit[] = [
  commit(
    "a100000012345678",
    ["a200000012345678"],
    "Polish branch history\n\nKeep graph tracks continuous across rows.\nRender complete commit messages without clipping.",
    "Mara Chen",
    "2026-09-13T11:52:00Z",
  ),
  commit(
    "a200000012345678",
    ["a300000012345678", "a400000012345678"],
    "Merge feature/history-graph",
    "Noah Williams",
    "2026-09-13T11:20:00Z",
  ),
  commit(
    "a300000012345678",
    ["a500000012345678"],
    "Use Bézier curves for lane transitions\n\nThe first parent keeps its track color.\nAdditional parents establish independent tracks.",
    "Iris Okafor",
    "2026-09-13T10:48:00Z",
  ),
  commit("a400000012345678", ["a600000012345678"], "Prepare release notes", "Mara Chen", "2026-09-13T10:15:00Z"),
  commit("a500000012345678", ["a900000012345678"], "Measure graph rows", "Iris Okafor", "2026-09-13T09:42:00Z"),
  commit(
    "a600000012345678",
    ["a700000012345678", "a800000012345678"],
    "Merge urgent history fix",
    "Noah Williams",
    "2026-09-13T09:10:00Z",
  ),
  commit("a700000012345678", ["a900000012345678"], "Add paged commit source", "Mara Chen", "2026-09-12T17:30:00Z"),
  commit(
    "a800000012345678",
    ["aa00000012345678"],
    "Prevent gaps between commit rows",
    "Noah Williams",
    "2026-09-12T16:05:00Z",
  ),
  commit("a900000012345678", ["aa00000012345678"], "Create history component", "Iris Okafor", "2026-09-12T14:20:00Z"),
  commit("aa00000012345678", [], "Initialize Codevette", "Mara Chen", "2026-09-10T08:00:00Z"),
];

function commit(
  id: string,
  parentIds: string[],
  message: string,
  author: string,
  authoredAt: string,
): GitHistoryCommit {
  return { id, parentIds, message, author, authoredAt };
}

function pagedSource(delay = 0): GitHistorySource {
  const pages: Record<string, GitHistoryPage> = {
    first: { commits: commits.slice(0, 2), nextCursor: "older" },
    older: { commits: commits.slice(2) },
  };
  return {
    async loadCommits(request) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return pages[request.cursor ?? "first"];
    },
  };
}

function RemountableHistory() {
  const [mounted, setMounted] = createSignal(true);
  return (
    <div>
      <button type="button" onClick={() => setMounted((value) => !value)}>
        {mounted() ? "Unmount" : "Mount"}
      </button>
      <Show when={mounted()}>
        <GitHistory source={pagedSource(500)} pageSize={2} now={() => now} />
      </Show>
    </div>
  );
}

export default {
  name: "Git History",
  description: "Paged commit ancestry rendered as a colored branch graph with author and time metadata.",
  scenarios: [
    {
      name: "Paged history",
      description: "Loads an initial page and fetches older parent commits on demand.",
      render: () => <GitHistory source={pagedSource()} pageSize={2} now={() => now} />,
    },
    {
      name: "Merge history",
      description: "Displays multiple colored ancestry lanes around a merge commit.",
      render: () => <GitHistory source={{ loadCommits: async () => ({ commits }) }} now={() => now} />,
    },
    {
      name: "Complex history and messages",
      description: "Several branch tracks, nested merges, and multi-line commit bodies remain fully visible.",
      render: () => <GitHistory source={{ loadCommits: async () => ({ commits: complexCommits }) }} now={() => now} />,
    },
    {
      name: "Delayed backend",
      description: "Keeps loading state visible while an asynchronous backend responds.",
      render: RemountableHistory,
    },
    {
      name: "Empty branch",
      render: () => <GitHistory source={{ loadCommits: async () => ({ commits: [] }) }} now={() => now} />,
    },
    {
      name: "Backend failure",
      render: () => (
        <GitHistory
          source={{ loadCommits: async () => Promise.reject(new Error("Repository is unavailable")) }}
          now={() => now}
        />
      ),
    },
  ],
} satisfies ComponentDemo;
