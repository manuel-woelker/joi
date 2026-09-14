import GitBranchIcon from "lucide-solid/icons/git-branch";
import GitPullRequestIcon from "lucide-solid/icons/git-pull-request";
import { createSignal } from "solid-js";

import { plugin } from "../../base/plugin-registry";
import { fetchServiceKey, type FetchService } from "../../base/services/fetch-service";
import { GitHistory } from "../../components/git-history/GitHistory";
import type { GitHistorySource } from "../../components/git-history/git-history";
import { CommandService } from "../../generated/api/command-service";
import { administrationContributions } from "../core/administration/contribution";
import { entityDescriptions } from "../core/entities/entity-registry";
import { EntityMasterDetailView } from "../core/master-detail/EntityMasterDetailView";
import {
  navigationEntryId,
  navigationSection,
  navigationSectionId,
  type NavigationRootContribution,
} from "../core/navigation/contribution";
import { executeDataQuery } from "../core/query/query-client";
import { shellContributionId, viewResolvers } from "../core/shell/contribution";
import { useWorkspace } from "../core/saved-views/controller";
import { CommitReviewView } from "./commit-review/CommitReviewView";
import { repositoryEntity } from "./repository-entity";

interface RepositoryBranch {
  readonly id: string;
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly name: string;
}

const branchViewPrefix = "codevette-branch/";
const commitViewPrefix = "codevette-commit/";

export default plugin({
  name: "codevette",
  description: "Trunk-based code review tools",
  requires: { fetchService: fetchServiceKey },
  registerExtensions(context) {
    const branches = createRepositoryNavigation(context.services.fetchService);
    context.registerExtension({
      point: entityDescriptions,
      id: "repository-entity",
      description: "Defines repositories available for code review",
      value: repositoryEntity,
    });
    context.registerExtension({
      point: administrationContributions,
      id: "repositories",
      description: "Configures repositories available for code review",
      value: {
        id: "repositories",
        name: "Repositories",
        description: "Repositories configured for trunk-based code review.",
        section: "Administration",
        icon: repositoryEntity.icon,
        content: () => <EntityMasterDetailView entityId={repositoryEntity.id} />,
      },
    });
    context.registerExtension({
      point: navigationSection,
      id: "codevette-navigation",
      description: "Displays repositories and their branches",
      value: {
        id: navigationSectionId("codevette"),
        label: "Codevette",
        order: 10,
        roots: branches.roots,
      },
    });
    context.registerExtension({
      point: viewResolvers,
      id: "codevette-branch-views",
      description: "Resolves Codevette branch views",
      value: {
        id: shellContributionId("codevette-branch-views"),
        order: 10,
        resolve(selection) {
          const id = selection.type === "view" ? selection.id : undefined;
          const commitParts = id?.startsWith(commitViewPrefix)
            ? id.slice(commitViewPrefix.length).split("/")
            : undefined;
          const commitBranch = commitParts?.length === 2 ? branches.byId(commitParts[0]) : undefined;
          if (commitBranch && commitParts) {
            return {
              id: `${commitViewPrefix}${commitParts.join("/")}`,
              name: commitParts[1].slice(0, 8),
              description: `${commitBranch.repositoryName} commit review`,
              section: "Codevette",
              icon: GitPullRequestIcon,
              content: () => (
                <CommitReviewView
                  service={context.services.fetchService}
                  branchId={commitParts[0]}
                  commitId={commitParts[1]}
                />
              ),
            };
          }
          const branch = id?.startsWith(branchViewPrefix)
            ? branches.byId(id.slice(branchViewPrefix.length))
            : undefined;
          return branch
            ? {
                id: `${branchViewPrefix}${branch.id}`,
                name: branch.name,
                description: `${branch.repositoryName} branch`,
                section: "Codevette",
                icon: GitBranchIcon,
                content: () => <BranchHistoryView service={context.services.fetchService} branch={branch} />,
              }
            : undefined;
        },
      },
    });
  },
});

function createRepositoryNavigation(service: FetchService): {
  readonly roots: () => readonly NavigationRootContribution[];
  readonly byId: (id: string) => RepositoryBranch | undefined;
} {
  const [items, setItems] = createSignal<RepositoryBranch[]>([]);
  let loading: Promise<void> | undefined;
  const load = () => {
    loading ??= Promise.all([
      executeDataQuery(service, {
        tableName: "repositories",
        criterion: "match_any",
        maxResults: 1_000,
        attributes: ["id", "name"],
      }),
      executeDataQuery(service, {
        tableName: "repository_branches",
        criterion: "match_any",
        maxResults: 10_000,
        attributes: ["id", "repository_id", "name"],
      }),
    ])
      .then(([repositories, branchResult]) => {
        const repositoryId = repositories.requireColumn("id");
        const repositoryName = repositories.requireColumn("name");
        const names = new Map(
          repositories.rows.map((row) => [String(row.value(repositoryId)), String(row.value(repositoryName))]),
        );
        const branchId = branchResult.requireColumn("id");
        const branchRepositoryId = branchResult.requireColumn("repository_id");
        const branchName = branchResult.requireColumn("name");
        setItems(
          branchResult.rows.flatMap((row) => {
            const repositoryIdValue = String(row.value(branchRepositoryId));
            const name = names.get(repositoryIdValue);
            return name
              ? [
                  {
                    id: String(row.value(branchId)),
                    repositoryId: repositoryIdValue,
                    repositoryName: name,
                    name: String(row.value(branchName)),
                  },
                ]
              : [];
          }),
        );
      })
      .catch((error: unknown) => console.error("Failed to load Codevette repository navigation", error));
  };
  return {
    roots: () => {
      void load();
      const grouped = new Map<string, RepositoryBranch[]>();
      for (const branch of items()) {
        const repositoryBranches = grouped.get(branch.repositoryId) ?? [];
        repositoryBranches.push(branch);
        grouped.set(branch.repositoryId, repositoryBranches);
      }
      return [...grouped.entries()].map(([repositoryId, repositoryBranches]) => ({
        id: navigationEntryId(`repository-${repositoryId}`),
        type: "folder" as const,
        label: repositoryBranches[0].repositoryName,
        icon: GitPullRequestIcon,
        children: repositoryBranches.map((branch) => ({
          id: navigationEntryId(`branch-${branch.id}`),
          type: "leaf" as const,
          label: branch.name,
          description: `${branch.repositoryName} branch`,
          icon: GitBranchIcon,
          selection: { type: "view" as const, id: `${branchViewPrefix}${branch.id}` },
        })),
      }));
    },
    byId: (id) => items().find((branch) => branch.id === id),
  };
}

function BranchHistoryView(props: { readonly service: FetchService; readonly branch: RepositoryBranch }) {
  const workspace = useWorkspace();
  return (
    <GitHistory
      ariaLabel={`${props.branch.repositoryName} ${props.branch.name} history`}
      source={gitHistorySource(props.service, props.branch.id)}
      pageSize={200}
      onCommitSelect={(commit) => {
        const id = `${commitViewPrefix}${props.branch.id}/${commit.id}`;
        workspace.navigation.selectView(id, { source: "system", section: "codevette", id });
      }}
    />
  );
}

function gitHistorySource(service: FetchService, branchId: string): GitHistorySource {
  const commands = new CommandService(service);
  return {
    async loadCommits({ cursor, limit }) {
      const response = await commands.codevetteHistory({ branchId, cursor: cursor ?? null, limit });
      return {
        commits: response.commits,
        nextCursor: response.nextCursor ?? undefined,
      };
    },
  };
}
