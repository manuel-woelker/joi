import EyeIcon from "lucide-solid/icons/eye";
import PencilIcon from "lucide-solid/icons/pencil";
import { createMemo, createResource, Show } from "solid-js";
import { useNavigation } from "../../base/navigation";
import { useApplicationServices } from "../../base/services/application-services";
import { CloseButton } from "../../components/CloseButton";
import { IconButton } from "../../components/IconButton";
import { sanitizedRichTextHtml } from "../../components/rich-text/sanitize-html";
import { DataText } from "../../components/SourceText";
import { CommandService } from "../../generated/api/command-service";
import { createEntityEditorDefinition } from "../core/entities/entity-editor";
import { RecordEditor } from "../core/entity-editor/RecordEditor";
import { reconcileRecordResult } from "../core/entity-editor/record-editor-store";
import type { EntityDisplayProps } from "../core/entity-pages/contribution";
import { parseQueryResponse } from "../core/query/query-result";
import styles from "./WikiPage.module.css";

/** A wiki document is readable by default; the hash parameter explicitly enables editing. */
export function WikiPage(props: EntityDisplayProps) {
  const navigation = useNavigation();
  const services = useApplicationServices();
  const commands = new CommandService(services.fetchService);
  const editing = () => navigation.hashState("edit") !== undefined;
  const [draft, { refetch }] = createResource(
    () => ({ id: props.recordId, create: editing() }),
    (request) => commands.wikiDraft(request),
  );
  const draftResult = createMemo(() => {
    const current = draft();
    if (!current?.exists) return undefined;
    return parseQueryResponse({
      number_of_hits: 1,
      result_columns: [
        { attribute: "id", values: { type: "string", values: [current.id] } },
        { attribute: "title", values: { type: "string", values: [current.title] } },
        { attribute: "content", values: { type: "string", values: [current.content] } },
      ],
    });
  });
  const draftDefinition = () => {
    const published = createEntityEditorDefinition(props.entity);
    return {
      ...published,
      tableName: "wikipage_drafts",
      fields: published.fields.map((field) => ({ ...field, required: false })),
      validation: undefined,
    };
  };
  const row = () =>
    props.result.rows.find(
      (candidate) => candidate.value(props.result.requireColumn(props.entity.identityAttribute)) === props.recordId,
    );
  const value = (attribute: string) => {
    const column = props.result.column(attribute);
    const current = row();
    const result = column && current?.value(column);
    return typeof result === "string" ? result : "";
  };
  const stopEditing = () => navigation.setHashState("edit");
  const publish = async () => {
    const published = await commands.wikiPublish({ id: props.recordId });
    reconcileRecordResult(props.result, props.entity.identityAttribute, props.recordId, {
      title: published.title,
      content: published.content,
    });
    services.dataChanges.publish({
      tableName: props.entity.tableName,
      recordId: props.recordId,
      changes: { title: published.title, content: published.content },
    });
    stopEditing();
    void refetch();
  };
  return (
    <section class={styles.page} aria-label="Wiki page">
      <Show
        when={!draft.error}
        fallback={
          <p role="alert">
            {String(draft.error?.message ?? draft.error)} <button onClick={() => void refetch()}>Retry</button>
          </p>
        }
      >
        <Show when={!draft.loading} fallback={<p role="status">Loading wiki draft...</p>}>
          <Show
            when={!editing()}
            fallback={
              <>
                <div class={styles.actions}>
                  <IconButton label="View page" icon={<EyeIcon size={16} />} text="View page" onClick={stopEditing} />
                </div>
                <Show when={draftResult()} fallback={<p role="alert">Draft not found.</p>}>
                  {(result) => (
                    <div class={styles.edit}>
                      <RecordEditor
                        definition={draftDefinition()}
                        fetchService={services.fetchService}
                        mode={{ type: "edit", result: result(), recordId: props.recordId }}
                        onClose={stopEditing}
                        onPublish={publish}
                        hideFieldLabels
                        bare
                      />
                    </div>
                  )}
                </Show>
              </>
            }
          >
            <div class={styles.actions}>
              <IconButton
                label="Edit page"
                icon={<PencilIcon size={16} />}
                text="Edit"
                onClick={() => navigation.setHashState("edit", "")}
              />
              <CloseButton label="Close page" onClick={props.onClose} />
            </div>
            <h2 class={styles.title}>
              <DataText>{value("title")}</DataText>
            </h2>
            <Show when={draft()?.exists}>
              <p class={styles.draftNotice}>Unpublished edits</p>
            </Show>
            <div class={styles.content} innerHTML={sanitizedRichTextHtml(value("content"))} />
          </Show>
        </Show>
      </Show>
    </section>
  );
}
