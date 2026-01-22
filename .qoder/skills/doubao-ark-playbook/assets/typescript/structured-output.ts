export function jsonObjectFormat() {
  return { text: { format: { type: "json_object" as const } } };
}

export function jsonSchemaFormat(params: { name: string; schema: unknown; strict?: boolean }) {
  return {
    text: {
      format: {
        type: "json_schema" as const,
        name: params.name,
        strict: params.strict ?? true,
        schema: params.schema,
      },
    },
  };
}

