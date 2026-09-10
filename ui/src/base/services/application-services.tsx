import { createContext, useContext, type ParentProps } from "solid-js";

import type { DataChangeService } from "../../plugins/core/data-changes/data-change-service";
import type { RecordMutationService } from "../../plugins/core/data-changes/record-mutation-service";

export interface ApplicationServices {
  readonly dataChanges: DataChangeService;
  readonly recordMutations: RecordMutationService;
}

const ApplicationServicesContext = createContext<ApplicationServices>();

export function ApplicationServicesProvider(props: ParentProps<{ services: ApplicationServices }>) {
  return (
    <ApplicationServicesContext.Provider value={props.services}>{props.children}</ApplicationServicesContext.Provider>
  );
}

export function useApplicationServices(): ApplicationServices {
  const services = useOptionalApplicationServices();
  if (!services) throw new Error("Application services are not available");
  return services;
}

export function useOptionalApplicationServices(): ApplicationServices | undefined {
  return useContext(ApplicationServicesContext);
}
