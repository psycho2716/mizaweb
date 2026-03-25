import { createHash } from "crypto";

export interface TemplateField {
  key: string;
  type: "number";
  unit?: "mm" | "cm" | "m";
  min?: number;
  max?: number;
  required?: boolean;
}

export interface TemplateSchemaV1 {
  version?: number;
  fields: TemplateField[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTemplateSchema(raw: unknown): TemplateSchemaV1 {
  if (!isRecord(raw)) {
    throw new Error("Template schema must be a JSON object.");
  }
  const fieldsRaw = raw.fields;
  if (!Array.isArray(fieldsRaw)) {
    throw new Error("Template schema requires a `fields` array.");
  }

  const fields: TemplateField[] = fieldsRaw.map((f, i) => {
    if (!isRecord(f)) {
      throw new Error(`Invalid field at index ${i}.`);
    }
    if (typeof f.key !== "string" || f.key.length === 0) {
      throw new Error(`Field at index ${i} needs a non-empty string key.`);
    }
    if (f.type !== "number") {
      throw new Error(`Field "${f.key}" must use type "number".`);
    }
    const unit = f.unit;
    if (unit !== undefined && unit !== "mm" && unit !== "cm" && unit !== "m") {
      throw new Error(`Field "${f.key}" has invalid unit.`);
    }
    return {
      key: f.key,
      type: "number",
      unit: unit,
      min: typeof f.min === "number" ? f.min : undefined,
      max: typeof f.max === "number" ? f.max : undefined,
      required: typeof f.required === "boolean" ? f.required : false,
    };
  });

  return { version: typeof raw.version === "number" ? raw.version : 1, fields };
}

function toMm(value: number, unit: TemplateField["unit"]): number {
  const u = unit ?? "mm";
  if (u === "mm") return value;
  if (u === "cm") return value * 10;
  return value * 1000;
}

export function validateAndNormalizeSnapshot(
  schema: TemplateSchemaV1,
  snapshot: unknown
): { normalized: Record<string, number>; fingerprint: string } {
  if (!isRecord(snapshot)) {
    throw new Error("Snapshot must be a JSON object.");
  }

  const normalized: Record<string, number> = {};

  for (const field of schema.fields) {
    const raw = snapshot[field.key];
    const missing = raw === undefined || raw === null;

    if (missing) {
      if (field.required) {
        throw new Error(`Missing required field: ${field.key}`);
      }
      continue;
    }

    if (typeof raw !== "number" || Number.isNaN(raw)) {
      throw new Error(`Field "${field.key}" must be a number.`);
    }

    let mm = toMm(raw, field.unit);
    mm = Math.round(mm);

    if (field.min !== undefined) {
      const minMm = Math.round(toMm(field.min, field.unit));
      if (mm < minMm) {
        throw new Error(`Field "${field.key}" is below minimum.`);
      }
    }
    if (field.max !== undefined) {
      const maxMm = Math.round(toMm(field.max, field.unit));
      if (mm > maxMm) {
        throw new Error(`Field "${field.key}" is above maximum.`);
      }
    }

    normalized[field.key] = mm;
  }

  const fingerprint = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return { normalized, fingerprint };
}
