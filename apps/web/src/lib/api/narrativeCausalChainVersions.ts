import { apiRequest } from './http';

export type NarrativeCausalChainVersionSource = 'ai' | 'manual' | 'restore';

export type NarrativeCausalChainVersionSummary = {
  id: string;
  createdAt: string;
  source: NarrativeCausalChainVersionSource;
  phase: number | null;
  completedPhase: number | null;
  validationStatus: string | null;
  chainSchemaVersion: string | null;
  label: string | null;
  note: string | null;
  basedOnVersionId: string | null;
};

export type NarrativeCausalChainVersionDetail = NarrativeCausalChainVersionSummary & {
  chain: unknown;
};

export async function apiListNarrativeCausalChainVersions(projectId: string, limit = 50) {
  const qs = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : '';
  return apiRequest<NarrativeCausalChainVersionSummary[]>(
    `/projects/${encodeURIComponent(projectId)}/narrative-causal-chain/versions${qs}`,
    { method: 'GET' },
  );
}

export async function apiGetNarrativeCausalChainVersion(projectId: string, versionId: string) {
  return apiRequest<NarrativeCausalChainVersionDetail>(
    `/projects/${encodeURIComponent(projectId)}/narrative-causal-chain/versions/${encodeURIComponent(versionId)}`,
    { method: 'GET' },
  );
}

export async function apiCreateNarrativeCausalChainSnapshot(
  projectId: string,
  input: { label?: string | null; note?: string | null } = {},
): Promise<NarrativeCausalChainVersionSummary> {
  return apiRequest<NarrativeCausalChainVersionSummary>(
    `/projects/${encodeURIComponent(projectId)}/narrative-causal-chain/versions`,
    { method: 'POST', body: input },
  );
}

export async function apiRestoreNarrativeCausalChainVersion(
  projectId: string,
  versionId: string,
  input: { label?: string | null; note?: string | null } = {},
): Promise<{ ok: true; restoredVersion: NarrativeCausalChainVersionSummary }> {
  return apiRequest<{ ok: true; restoredVersion: NarrativeCausalChainVersionSummary }>(
    `/projects/${encodeURIComponent(projectId)}/narrative-causal-chain/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST', body: input },
  );
}


