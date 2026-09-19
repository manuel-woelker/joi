/** Formats a timestamp as a human relative time such as "2 hours ago". */
export function formatRelativeTime(value: Date | string | number, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1_000);
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ] as const;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds) return formatter.format(Math.round(deltaSeconds / seconds), unit);
  }
  return formatter.format(deltaSeconds, "second");
}
