import type { DataTableColumnConfig, DataTableSort } from "../../../components/DataTable";
import type { FilterDefinition } from "../../../components/filter-definition/filter-model";
import type { FacetSelection } from "../saved-views/entity-query";

/** Per-view master-detail settings. Absent fields fall back to the view's defaults. */
export interface MasterDetailViewConfig {
  readonly filter?: FilterDefinition;
  readonly facets?: readonly FacetSelection[];
  readonly visibleFacetIds?: readonly string[];
  readonly sorting?: readonly DataTableSort[];
  readonly columnSearch?: Readonly<Record<string, string>>;
  readonly columns?: DataTableColumnConfig;
}
