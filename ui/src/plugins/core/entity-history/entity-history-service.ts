import { serviceKey } from "../../../base/service-registry";
import type { FetchService } from "../../../base/services/fetch-service";
import { CommandService } from "../../../generated/api/command-service";
import type { EntityHistoryRequest, EntityHistoryResponse } from "../../../generated/api/api";

/** Server-backed capability and paginated history reads; no entity data is cached. */
export class EntityHistoryService {
  private readonly commands: CommandService;
  private capabilities?: Promise<ReadonlySet<string>>;

  constructor(fetchService: FetchService) {
    this.commands = new CommandService(fetchService);
  }

  /** Loads model metadata once, retrying after a failed request. */
  async enabled(table: string): Promise<boolean> {
    this.capabilities ??= this.commands
      .modelInfo({})
      .then((response) => new Set(response.models.filter((model) => model.history).map((model) => model.name)))
      .catch((error) => {
        this.capabilities = undefined;
        throw error;
      });
    return (await this.capabilities).has(table);
  }

  /** Retrieves bounded pages in descending history-key order. */
  load(request: EntityHistoryRequest): Promise<EntityHistoryResponse> {
    return this.commands.entityHistory(request);
  }
}

export const entityHistoryServiceKey = serviceKey<EntityHistoryService>("entity-history-service");
