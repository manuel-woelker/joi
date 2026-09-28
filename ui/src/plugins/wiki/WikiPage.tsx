import EyeIcon from "lucide-solid/icons/eye";
import PencilIcon from "lucide-solid/icons/pencil";
import { Show } from "solid-js";
import { useNavigation } from "../../base/navigation";
import { useApplicationServices } from "../../base/services/application-services";
import { CloseButton } from "../../components/CloseButton";
import { IconButton } from "../../components/IconButton";
import { sanitizedRichTextHtml } from "../../components/rich-text/sanitize-html";
import { DataText } from "../../components/SourceText";
import { createEntityEditorDefinition } from "../core/entities/entity-editor";
import { RecordEditor } from "../core/entity-editor/RecordEditor";
import type { EntityDisplayProps } from "../core/entity-pages/contribution";
import styles from "./WikiPage.module.css";

/** A wiki document is readable by default; the hash parameter explicitly enables editing. */
export function WikiPage(props: EntityDisplayProps) {
  const navigation = useNavigation();
  const services = useApplicationServices();
  const editing = () => navigation.hashState("edit") !== undefined;
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
  return (
    <section class={styles.page} aria-label="Wiki page">
      <Show
        when={!editing()}
        fallback={
          <>
            <div class={styles.actions}>
              <IconButton label="View page" icon={<EyeIcon size={16} />} text="View page" onClick={stopEditing} />
            </div>
            <div class={styles.edit}>
              <RecordEditor
                definition={createEntityEditorDefinition(props.entity)}
                fetchService={services.fetchService}
                mode={{ type: "edit", result: props.result, recordId: props.recordId }}
                onClose={stopEditing}
                hideFieldLabels
                bare
              />
            </div>
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
        <div class={styles.content} innerHTML={sanitizedRichTextHtml(value("content"))} />
      </Show>
    </section>
  );
}
