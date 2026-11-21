export function layoutGraph(response) {
  if (!Array.isArray(response?.components)) {
    throw new Error("The API response is missing the components array.");
  }

  const components = new Map();
  for (const component of response.components) {
    if (
      typeof component?.id !== "string" ||
      typeof component.label !== "string" ||
      typeof component.description !== "string" ||
      components.has(component.id)
    ) {
      throw new Error("The API returned invalid or duplicate component metadata.");
    }
    components.set(component.id, component);
  }

  const outgoing = new Map();
  const incoming = new Map(Array.from(components.keys(), (id) => [id, []]));
  for (const [id, component] of components) {
    const relationships = component.relationships ?? [];
    if (!Array.isArray(relationships)) {
      throw new Error("The API returned invalid component relationships.");
    }
    const edges = relationships.map((relationship) => {
      if (typeof relationship?.kind !== "string" || !components.has(relationship.target_id)) {
        throw new Error("The API returned an invalid relationship target or kind.");
      }
      const edge = { from: id, to: relationship.target_id, kind: relationship.kind };
      incoming.get(edge.to).push(edge);
      return edge;
    });
    outgoing.set(id, edges);
  }

  const columns = [];
  const visited = new Set();
  function visit(seeds) {
    const queue = [];
    function place(id, depth) {
      if (visited.has(id)) return;
      visited.add(id);
      (columns[depth] ??= []).push(id);
      queue.push({ id, depth });
    }

    for (const id of seeds) place(id, 0);
    for (let index = 0; index < queue.length; index += 1) {
      const { id, depth } = queue[index];
      for (const edge of outgoing.get(id)) place(edge.to, depth + 1);
    }
  }

  visit(Array.from(components.keys()).filter((id) => incoming.get(id).length === 0));
  for (const id of components.keys()) {
    if (!visited.has(id)) visit([id]);
  }
  return { components, columns, incoming, outgoing };
}
