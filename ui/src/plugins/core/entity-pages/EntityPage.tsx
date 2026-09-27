import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useNavigation } from "../../../base/navigation";
import { useApplicationServices } from "../../../base/services/application-services";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import { useEntityRegistry } from "../entities/entity-registry";
import { RecordEditor } from "../entity-editor/RecordEditor";
import type { EntityDisplayContribution, EntityDisplayProps } from "./contribution";
import styles from "./EntityPage.module.css";
import { createEntityPageStore } from "./entity-page-store";

/** Generic editable fallback also used by the master-detail view through RecordEditor. */
export function GenericEntityDisplay(props: EntityDisplayProps) {
  const services = useApplicationServices();
  return (
    <RecordEditor
      definition={createEntityEditorDefinition(props.entity)}
      fetchService={services.fetchService}
      mode={{ type: "edit", result: props.result, recordId: props.recordId }}
      onClose={props.onClose}
    />
  );
}

export function EntityPage(props: { reference: string; displays: readonly EntityDisplayContribution[] }) {
  const navigation = useNavigation();
  const services = useApplicationServices();
  const store = createEntityPageStore(() => props.reference, { ...services, models: useEntityRegistry() });
  return (
    <div class={styles.page}>
      <Show
        when={!store.page.error}
        fallback={
          <div role="alert" class={styles.state}>
            <p>{String(store.page.error?.message ?? store.page.error)}</p>
            <button onClick={store.retry}>Retry</button>
            <button onClick={navigation.closeEntity}>Close</button>
          </div>
        }
      >
        <Show when={!store.page.loading} fallback={<p role="status">Loading entity...</p>}>
          <Show when={store.page()}>
            {(page) => (
              <Show
                when={page().recordId}
                fallback={
                  <div class={styles.state}>
                    <p role="status">Entity not found.</p>
                    <button onClick={store.retry}>Retry</button>
                    <button onClick={navigation.closeEntity}>Close</button>
                  </div>
                }
              >
                {(id) => (
                  <Show keyed when={`${page().entity.id}:${id()}`}>
                    {(_identity) => (
                      <Dynamic
                        component={
                          props.displays.find((display) => display.entityType === page().entity.id)?.component ??
                          GenericEntityDisplay
                        }
                        entity={page().entity}
                        result={page().result}
                        recordId={id()}
                        onClose={navigation.closeEntity}
                      />
                    )}
                  </Show>
                )}
              </Show>
            )}
          </Show>
        </Show>
      </Show>
    </div>
  );
}
