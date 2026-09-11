import type { FetchService } from "../../../base/services/fetch-service";
import { EntityAdministrationView } from "../../core/administration/EntityAdministrationView";
import { useLookupService } from "../../core/lookups/lookup";
import { projectEntity } from "./project-entity";
import { projectLookupId } from "./project-lookup";

export function Projects(props: { fetchService: FetchService }) {
  const lookups = useLookupService();
  return (
    <EntityAdministrationView
      entityId={projectEntity.id}
      fetchService={props.fetchService}
      onChanged={() => lookups.invalidate(projectLookupId)}
    />
  );
}
