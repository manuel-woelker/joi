import GitBranchIcon from "lucide-solid/icons/git-branch";
import GitPullRequestIcon from "lucide-solid/icons/git-pull-request";
import { createSignal } from "solid-js";

import { plugin } from "../../base/plugin-registry";
import { fetchServiceKey, type FetchService } from "../../base/services/fetch-service";
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
import { repositoryEntity } from "./repository-entity";

interface RepositoryBranch {
  readonly id: string;
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly name: string;
}

const branchViewPrefix = "codevette-branch/";

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
                content: () => (
                  <section>
                    <h2>{branch.repositoryName}</h2>
                    <p>{branch.name}</p>
                  </section>
                ),
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
    ]).then(([repositories, branchResult]) => {
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
    });
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
