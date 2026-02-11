function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

function envPositiveInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.floor(n);
}

export function isAgentCharacterExpansionEnabled(): boolean {
  return envBool('AI_AGENT_CHARACTER_EXPANSION_ENABLED', false);
}

export function isAgentNarrativePhase34Enabled(): boolean {
  return envBool('AI_AGENT_NARRATIVE_PHASE34_ENABLED', false);
}

export function isAgentSupervisorEnabled(): boolean {
  return envBool('AI_AGENT_SUPERVISOR_ENABLED', false);
}

export function isAgentEpisodeCreationEnabled(): boolean {
  return envBool('AI_AGENT_EPISODE_CREATION_ENABLED', true);
}

export function isAgentFallbackToLegacyEnabled(): boolean {
  return envBool('AI_AGENT_FALLBACK_TO_LEGACY', true);
}

export function getAgentMaxSteps(): number {
  return envPositiveInt('AI_AGENT_MAX_STEPS', 6);
}

export function getAgentStepTimeoutMs(): number {
  return envPositiveInt('AI_AGENT_STEP_TIMEOUT_MS', 45_000);
}

export function getAgentTotalTimeoutMs(): number {
  return envPositiveInt('AI_AGENT_TOTAL_TIMEOUT_MS', 180_000);
}
