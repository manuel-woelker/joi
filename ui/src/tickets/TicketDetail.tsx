import { Show, createEffect, createResource, createSignal } from "solid-js";

import { fetchService } from "../services/fetch-service";
import { loadTicket, updateTicket } from "../workspace/ticket-api";
import styles from "./TicketDetail.module.css";

export function TicketDetail(props: { ticketId: string }) {
  const [ticket, { refetch }] = createResource(
    () => props.ticketId,
    (id) => loadTicket(id, fetchService),
  );
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string>();
  const [saved, setSaved] = createSignal(false);

  createEffect(() => {
    const result = ticket();
    const row = result?.rows[0];
    if (!result || !row) return;
    setTitle(String(row.value(result.requireColumn("title")) ?? ""));
    setDescription(String(row.value(result.requireColumn("description")) ?? ""));
  });

  const key = () => {
    const result = ticket();
    return result?.rows[0] ? String(result.rows[0].value(result.requireColumn("key")) ?? "") : "";
  };

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    setSaved(false);
    try {
      await updateTicket(props.ticketId, { title: title(), description: description() }, fetchService);
      await refetch();
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Ticket could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={!ticket.loading} fallback={<div class={styles.state}>Loading ticket</div>}>
      <Show when={!ticket.error && ticket()?.rows.length} fallback={<div class={styles.state}>Ticket not found.</div>}>
        <form class={styles.form} onSubmit={save}>
          <div class={styles.ticketKey}>{key()}</div>
          <label>
            <span>Title</span>
            <input value={title()} onInput={(event) => setTitle(event.currentTarget.value)} required />
          </label>
          <label>
            <span>Description</span>
            <textarea value={description()} onInput={(event) => setDescription(event.currentTarget.value)} rows={10} />
          </label>
          <div class={styles.actions}>
            <Show when={saveError()}>{(message) => <span class={styles.error}>{message()}</span>}</Show>
            <Show when={saved()}>
              <span class={styles.saved}>Saved</span>
            </Show>
            <button type="submit" disabled={saving()}>
              {saving() ? "Saving" : "Save changes"}
            </button>
          </div>
        </form>
      </Show>
    </Show>
  );
}
