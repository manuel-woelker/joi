/** Persistable layout state. IDs are attributes, not query-result handles. */
export interface DataTableColumnConfig {
  readonly order: readonly string[];
  readonly widths: Readonly<Record<string, number>>;
  /** Omitted in older configs: use the caller's default columns. */
  readonly visible?: readonly string[];
}

/** Reconcile stored settings with a catalog without changing the persisted input. */
export function normalizeColumnConfig(
  config: DataTableColumnConfig | undefined,
  catalog: readonly string[],
  defaults: readonly string[],
): DataTableColumnConfig {
  const known = new Set(catalog);
  const unique = (ids: readonly string[]) => [...new Set(ids)].filter((id) => known.has(id));
  let visible = unique(config?.visible ?? defaults);
  if (!visible.length) visible = unique(defaults);
  if (!visible.length && catalog.length) visible = [catalog[0]];
  return {
    order: unique([...(config?.order ?? []), ...defaults, ...catalog]),
    visible,
    widths: Object.fromEntries(
      Object.entries(config?.widths ?? {}).filter(
        ([id, width]) => known.has(id) && Number.isFinite(width) && width >= 32,
      ),
    ),
  };
}

export function visibleColumnOrder(config: DataTableColumnConfig): string[] {
  const visible = new Set(config.visible ?? config.order);
  return config.order.filter((id) => visible.has(id));
}

/** Add and re-add always place a column first, retaining its saved width. */
export function addTableColumn(config: DataTableColumnConfig, id: string): DataTableColumnConfig {
  if (!config.order.includes(id)) return config;
  return {
    ...config,
    order: [id, ...config.order.filter((value) => value !== id)],
    visible: [...new Set([id, ...visibleColumnOrder(config)])],
  };
}

export function removeTableColumn(config: DataTableColumnConfig, id: string): DataTableColumnConfig {
  const visible = visibleColumnOrder(config);
  return visible.length <= 1 ? config : { ...config, visible: visible.filter((value) => value !== id) };
}

/** Move within visible columns; hidden columns never become drop targets. */
export function moveTableColumn(config: DataTableColumnConfig, id: string, index: number): DataTableColumnConfig {
  const order = visibleColumnOrder(config);
  if (!order.includes(id)) return config;
  order.splice(order.indexOf(id), 1);
  order.splice(Math.max(0, Math.min(index, order.length)), 0, id);
  return { ...config, order: [...order, ...config.order.filter((value) => !order.includes(value))] };
}
