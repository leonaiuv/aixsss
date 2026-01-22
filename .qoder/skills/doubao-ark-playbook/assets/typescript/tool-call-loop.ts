import type { ArkResponse, ArkResponsesCreateBody } from "./ark-responses-client";

export type ToolDefinition = {
  type: "function";
  name: string;
  description?: string;
  parameters?: unknown;
};

export type ToolHandler = (args: unknown) => Promise<unknown> | unknown;

export type ToolSpec = {
  definition: ToolDefinition;
  handler: ToolHandler;
};

export async function runFunctionCallingLoop(params: {
  responsesCreate: (body: ArkResponsesCreateBody) => Promise<ArkResponse>;
  model: string;
  input: unknown;
  toolSpecs: ToolSpec[];
  maxIterations?: number;
  maxToolCalls?: number;
}) {
  const tools = params.toolSpecs.map((t) => t.definition);
  const handlerByName = new Map(params.toolSpecs.map((t) => [t.definition.name, t.handler] as const));

  const maxIterations = params.maxIterations ?? 8;

  let response = await params.responsesCreate({
    model: params.model,
    input: params.input,
    tools,
    ...(params.maxToolCalls !== undefined ? { max_tool_calls: params.maxToolCalls } : {}),
  });

  for (let i = 0; i < maxIterations; i++) {
    const functionCalls = (response.output ?? []).filter(
      (item) => item?.type === "function_call",
    ) as Array<Record<string, unknown>>;

    if (functionCalls.length === 0) return response;

    const toolOutputs = functionCalls.map((call) => {
      const name = String(call.name ?? "");
      const callId = String(call.call_id ?? "");
      const rawArgs = call.arguments;

      if (!name || !callId) {
        throw new Error(`Invalid function_call item: ${JSON.stringify(call)}`);
      }

      const handler = handlerByName.get(name);
      if (!handler) {
        throw new Error(`No handler registered for tool: ${name}`);
      }

      return { name, callId, rawArgs, handler };
    });

    const input = [];
    for (const t of toolOutputs) {
      const args = safeJsonParse(t.rawArgs);
      const output = await t.handler(args);
      input.push({
        type: "function_call_output",
        call_id: t.callId,
        output: JSON.stringify(output),
      });
    }

    response = await params.responsesCreate({
      model: params.model,
      previous_response_id: response.id,
      input,
      tools,
      ...(params.maxToolCalls !== undefined ? { max_tool_calls: params.maxToolCalls } : {}),
    });
  }

  throw new Error(`Exceeded maxIterations (${maxIterations}) in tool-calling loop`);
}

function safeJsonParse(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

