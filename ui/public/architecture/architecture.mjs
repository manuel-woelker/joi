import { layoutGraph } from "./graph.mjs";

const status = document.querySelector("#status");
const graph = document.querySelector("#graph");
const nodes = document.querySelector("#nodes");
const canvas = document.querySelector("#edges");
const details = document.querySelector("#details");
const refresh = document.querySelector("#refresh");
const filter = document.querySelector("#filter");
const cards = new Map();
let model;
let selected;
let frame;

function element(tag, content, className) {
  const result = document.createElement(tag);
  if (content !== undefined) result.textContent = content;
  if (className) result.className = className;
  return result;
}

function renderGraph() {
  cards.clear();
  nodes.replaceChildren();
  for (const column of model.columns) {
    const group = element("div", undefined, "column");
    for (const id of column) {
      const component = model.components.get(id);
      const card = element("button", undefined, "node");
      card.type = "button";
      card.append(
        element("span", component.label, "node-label"),
        element("span", id, "component-id"),
      );
      card.addEventListener("click", () => select(id));
      cards.set(id, card);
      group.append(card);
    }
    nodes.append(group);
  }
}

function showValues(heading, values) {
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return;

  const section = element("section");
  const list = element("dl");
  for (const [name, value] of entries) {
    const row = element("div");
    row.append(element("dt", name), element("dd", JSON.stringify(value, null, 2)));
    list.append(row);
  }
  section.append(element("h4", heading), list);
  details.append(section);
}

function showRelationships(heading, edges, targetKey) {
  if (edges.length === 0) return;

  const section = element("section");
  const list = element("ul");
  for (const edge of edges) {
    const id = edge[targetKey];
    const item = element("li");
    const button = element("button", model.components.get(id).label, "relationship-target");
    button.type = "button";
    button.addEventListener("click", () => {
      select(id);
      cards.get(id).focus({ preventScroll: true });
      cards.get(id).scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    item.append(element("span", edge.kind, "relationship-kind"), button);
    list.append(item);
  }
  section.append(element("h4", heading), list);
  details.append(section);
}

function select(id) {
  selected = id;
  for (const [cardId, card] of cards) {
    card.setAttribute("aria-pressed", String(cardId === id));
  }
  details.replaceChildren();
  if (id === undefined) {
    details.append(element("p", "No components to inspect."));
    scheduleEdges();
    return;
  }

  const component = model.components.get(id);
  details.append(
    element("h3", component.label),
    element("span", component.id, "component-id"),
    element("p", component.description),
  );
  showValues("Configuration", component.config);
  showValues("Metrics", component.metrics);
  showRelationships("Outgoing relationships", model.outgoing.get(id), "to");
  showRelationships("Incoming relationships", model.incoming.get(id), "from");
  scheduleEdges();
}

function updateFilter() {
  if (!model) return;
  const query = filter.value.trim().toLowerCase();
  let matches = 0;
  for (const [id, card] of cards) {
    const { label, description } = model.components.get(id);
    const match = [id, label, description].some((value) => value.toLowerCase().includes(query));
    if (match) matches += 1;
    card.classList.toggle("dimmed", !match);
  }
  const total = cards.size;
  const edges = Array.from(model.outgoing.values()).reduce((sum, values) => sum + values.length, 0);
  const count = (value, word) => `${value} ${word}${value === 1 ? "" : "s"}`;
  status.textContent = query
    ? `${matches} of ${count(total, "component")} match`
    : `${count(total, "component")} · ${count(edges, "relationship")}`;
  scheduleEdges();
}

function drawEdges() {
  const bounds = graph.getBoundingClientRect();
  const scale = Math.min(
    window.devicePixelRatio || 1,
    8192 / Math.max(bounds.width, bounds.height, 1),
    Math.sqrt(8_000_000 / Math.max(bounds.width * bounds.height, 1)),
  );
  canvas.width = Math.ceil(bounds.width * scale);
  canvas.height = Math.ceil(bounds.height * scale);
  const pen = canvas.getContext("2d");
  if (!pen || !model) return;
  pen.scale(scale, scale);

  const positions = new Map();
  for (const [id, card] of cards) {
    const box = card.getBoundingClientRect();
    positions.set(id, {
      left: box.left - bounds.left,
      right: box.right - bounds.left,
      middle: box.top + box.height / 2 - bounds.top,
      dimmed: card.classList.contains("dimmed"),
    });
  }

  for (const edges of model.outgoing.values()) {
    for (const edge of edges) {
      const source = positions.get(edge.from);
      const target = positions.get(edge.to);
      const forwards = source.left < target.left;
      const backwards = source.left > target.left;
      const start = backwards ? source.left : source.right;
      const end = forwards ? target.left : target.right;
      const startY = source.middle - (edge.from === edge.to ? 12 : 0);
      const endY = target.middle + (edge.from === edge.to ? 12 : 0);
      const offset = Math.max(24, Math.abs(end - start) * .5);
      const highlighted = edge.from === selected || edge.to === selected;

      pen.strokeStyle = highlighted ? "#214ec1" : "#61758f";
      pen.lineWidth = highlighted ? 2 : 1.25;
      pen.globalAlpha = source.dimmed || target.dimmed ? .23 : .86;
      pen.beginPath();
      pen.moveTo(start, startY);
      pen.bezierCurveTo(
        start + (backwards ? -offset : offset), startY,
        end + (forwards ? -offset : offset), endY,
        end, endY,
      );
      pen.stroke();

      const arrow = forwards ? -7 : 7;
      pen.beginPath();
      pen.moveTo(end + arrow, endY - 4);
      pen.lineTo(end, endY);
      pen.lineTo(end + arrow, endY + 4);
      pen.stroke();
    }
  }
}

function scheduleEdges() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(drawEdges);
}

async function load() {
  refresh.disabled = true;
  filter.disabled = true;
  status.classList.remove("error");
  status.textContent = "Loading components…";

  try {
    const response = await fetch("/api/architecture", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`The API returned HTTP ${response.status}.`);
    model = layoutGraph(await response.json());
    renderGraph();
    select(model.components.has(selected) ? selected : model.columns[0]?.[0]);
    updateFilter();
  } catch (error) {
    status.classList.add("error");
    status.textContent = `Could not load architecture. ${error.message}${model ? " Showing the previous snapshot." : ""}`;
    if (!model) details.replaceChildren(element("p", "Refresh to retry."));
  } finally {
    refresh.disabled = false;
    filter.disabled = !cards.size || status.classList.contains("error");
  }
}

refresh.addEventListener("click", load);
filter.addEventListener("input", updateFilter);
new ResizeObserver(scheduleEdges).observe(graph);
window.addEventListener("resize", scheduleEdges);
load();
