import { createContext, useContext, type ParentProps } from "solid-js";

import type { DataChangeService } from "../../plugins/core/data-changes/data-change-service";
import type { RecordMutationService } from "../../plugins/core/data-changes/record-mutation-service";

/** Shared stateful services exposed to components below the application shell. */
export interface ApplicationServices {
  readonly dataChanges: DataChangeService;
  readonly recordMutations: RecordMutationService;
}

const ApplicationServicesContext = createContext<ApplicationServices>();

/** Makes application services available to descendant Solid components. */
export function ApplicationServicesProvider(props: ParentProps<{ services: ApplicationServices }>) {
  return (
    <ApplicationServicesContext.Provider value={props.services}>{props.children}</ApplicationServicesContext.Provider>
  );
}

/** Returns application services or throws when used outside their provider. */
export function useApplicationServices(): ApplicationServices {
  const services = useOptionalApplicationServices();
  if (!services) throw new Error("Application services are not available");
  return services;
}

/** Returns application services when a provider is present. */
export function useOptionalApplicationServices(): ApplicationServices | undefined {
  return useContext(ApplicationServicesContext);
}
