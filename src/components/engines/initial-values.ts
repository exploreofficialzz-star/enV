import type { UiField } from "./fields";

export function initialValues(fields: UiField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] =
      field.defaultValue === undefined || field.defaultValue === ""
        ? ""
        : String(field.defaultValue);
  }
  return values;
}
