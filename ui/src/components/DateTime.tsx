import { type ComponentProps, splitProps } from "solid-js";

import styles from "./DateTime.module.css";

export interface DateTimeProps extends ComponentProps<"time"> {
  readonly value: string | Date | number;
}

function formatISO8601(value: Date): string {
  const iso = value.toISOString();
  const offset = -value.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offset) / 60);
  const offsetMinutes = Math.abs(offset) % 60;
  const offsetStr =
    (offset >= 0 ? "+" : "-") + String(offsetHours).padStart(2, "0") + ":" + String(offsetMinutes).padStart(2, "0");
  return iso.replace("Z", offsetStr);
}

export function DateTime(props: DateTimeProps) {
  const [local, rest] = splitProps(props, ["class", "value"]);
  const date = () => {
    const v = local.value;
    return v instanceof Date ? v : typeof v === "string" ? new Date(v) : new Date(v);
  };
  const display = () => formatISO8601(date());
  const iso = () => (date() instanceof Date ? date().toISOString() : String(local.value));

  return (
    <time {...rest} class={`${styles.datetime} ${local.class ?? ""}`} datetime={iso()} title={display()}>
      {display()}
    </time>
  );
}