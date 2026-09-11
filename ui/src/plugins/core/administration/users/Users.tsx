import type { FetchService } from "../../../../base/services/fetch-service";
import { EntityAdministrationView } from "../EntityAdministrationView";
import { userEntity } from "./user-entity";

export function Users(props: { fetchService: FetchService }) {
  return <EntityAdministrationView entityId={userEntity.id} fetchService={props.fetchService} />;
}
