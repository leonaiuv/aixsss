export type ArkResponsesCreateBody = Record<string, unknown>;

export type ArkResponse = {
  id: string;
  output?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ArkClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
};

export function createArkClient(options: ArkClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ARK_API_KEY (or pass apiKey)");
  }

  const baseUrl = (options.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3").replace(
    /\/+$/,
    "",
  );

  const defaultHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(options.defaultHeaders ?? {}),
  };

  return {
    async responsesCreate(
      body: ArkResponsesCreateBody,
      init?: { headers?: Record<string, string>; signal?: AbortSignal },
    ): Promise<ArkResponse> {
      const res = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: { ...defaultHeaders, ...(init?.headers ?? {}) },
        body: JSON.stringify(body),
        signal: init?.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`ARK /responses ${res.status} ${res.statusText}: ${text}`);
      }

      try {
        return JSON.parse(text) as ArkResponse;
      } catch {
        throw new Error(`Failed to parse ARK response JSON: ${text}`);
      }
    },
  };
}

