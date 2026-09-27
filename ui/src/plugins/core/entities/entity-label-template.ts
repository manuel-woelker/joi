/** A precompiled literal fragment or attribute substitution in an entity label. */
export type EntityLabelPart =
  | { readonly type: "literal"; readonly text: string }
  | { readonly type: "attribute"; readonly attribute: string };

/** Parses template syntax once during entity definition, without evaluating expressions. */
export function parseLabelTemplate(template: string | undefined): readonly EntityLabelPart[] {
  if (template === undefined) return [];
  if (!template.trim()) throw new Error("Entity label template must not be empty");
  const parts: EntityLabelPart[] = [];
  let position = 0;
  while (position < template.length) {
    const start = template.indexOf("${", position);
    if (start === -1) {
      parts.push({ type: "literal", text: template.slice(position) });
      break;
    }
    if (start > position) parts.push({ type: "literal", text: template.slice(position, start) });
    const end = template.indexOf("}", start + 2);
    const attribute = template.slice(start + 2, end);
    if (end === -1 || !attribute || attribute.includes("{")) {
      throw new Error(`Invalid entity label template: ${template}`);
    }
    parts.push({ type: "attribute", attribute });
    position = end + 1;
  }
  return parts;
}
