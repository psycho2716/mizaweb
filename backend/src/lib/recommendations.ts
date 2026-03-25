import type { TemplateSchemaV1 } from "./snapshotValidate";

/**
 * Template-driven sizing guidance (Phase 7) — deterministic, no ML.
 */
export function buildGuidanceFromSnapshot(
  schema: TemplateSchemaV1,
  normalizedMm: Record<string, number>
): string[] {
  const tips: string[] = [];

  const length = normalizedMm.lengthMm ?? normalizedMm.length ?? normalizedMm.L;
  const width = normalizedMm.widthMm ?? normalizedMm.width ?? normalizedMm.W;

  if (typeof length === "number" && typeof width === "number") {
    const ratio = length >= width ? length / Math.max(width, 1) : width / Math.max(length, 1);
    if (ratio > 2.5) {
      tips.push("Elongated footprint: consider joint layout and transport splits for long slabs.");
    }
  }

  if (schema.fields.some((f) => f.key.toLowerCase().includes("thickness"))) {
    const tKey = schema.fields.find((f) => f.key.toLowerCase().includes("thickness"))?.key;
    const t = tKey ? normalizedMm[tKey] : undefined;
    if (typeof t === "number" && t < 15) {
      tips.push("Thin specified thickness: confirm structural suitability with your fabricator.");
    }
  }

  if (tips.length === 0) {
    tips.push("Dimensions look within typical fab ranges; verify on-site measurements before cutting.");
  }

  return tips;
}
