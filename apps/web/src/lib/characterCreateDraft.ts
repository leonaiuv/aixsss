import type { PortraitPrompts } from '@/types';

export type CharacterCreateDraftFormData = {
  name: string;
  briefDescription: string;
  appearance: string;
  personality: string;
  background: string;
  themeColor: string;
  primaryColor: string;
  secondaryColor: string;
  portraitPrompts?: PortraitPrompts;
};

export type CharacterCreateDraft = {
  version: 1;
  projectId: string;
  formData: CharacterCreateDraftFormData;
  dialogStep: 'basic' | 'portrait';
  lastAIResponse: string | null;
  lastAIDetails: string | null;
  taskIds: {
    basicInfoTaskId: string | null;
    portraitTaskId: string | null;
  };
  updatedAt: number;
};

const STORAGE_KEY_PREFIX = 'aixs_character_create_draft_';

export function getCharacterCreateDraftKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

export function loadCharacterCreateDraft(projectId: string): CharacterCreateDraft | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(getCharacterCreateDraftKey(projectId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CharacterCreateDraft> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (parsed.projectId !== projectId) return null;
    if (!parsed.formData || typeof parsed.formData !== 'object') return null;
    if (parsed.dialogStep !== 'basic' && parsed.dialogStep !== 'portrait') return null;

    return {
      version: 1,
      projectId,
      formData: {
        name: String((parsed.formData as CharacterCreateDraftFormData).name ?? ''),
        briefDescription: String((parsed.formData as CharacterCreateDraftFormData).briefDescription ?? ''),
        appearance: String((parsed.formData as CharacterCreateDraftFormData).appearance ?? ''),
        personality: String((parsed.formData as CharacterCreateDraftFormData).personality ?? ''),
        background: String((parsed.formData as CharacterCreateDraftFormData).background ?? ''),
        themeColor: String((parsed.formData as CharacterCreateDraftFormData).themeColor ?? '#6366f1'),
        primaryColor: String((parsed.formData as CharacterCreateDraftFormData).primaryColor ?? ''),
        secondaryColor: String((parsed.formData as CharacterCreateDraftFormData).secondaryColor ?? ''),
        portraitPrompts: (parsed.formData as CharacterCreateDraftFormData).portraitPrompts,
      },
      dialogStep: parsed.dialogStep,
      lastAIResponse: typeof parsed.lastAIResponse === 'string' ? parsed.lastAIResponse : null,
      lastAIDetails: typeof parsed.lastAIDetails === 'string' ? parsed.lastAIDetails : null,
      taskIds: {
        basicInfoTaskId: parsed.taskIds?.basicInfoTaskId ?? null,
        portraitTaskId: parsed.taskIds?.portraitTaskId ?? null,
      },
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch (error) {
    console.warn('Failed to parse character create draft:', error);
    return null;
  }
}

export function saveCharacterCreateDraft(projectId: string, draft: CharacterCreateDraft): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getCharacterCreateDraftKey(projectId), JSON.stringify(draft));
  } catch (error) {
    console.warn('Failed to save character create draft:', error);
  }
}

export function clearCharacterCreateDraft(projectId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getCharacterCreateDraftKey(projectId));
  } catch (error) {
    console.warn('Failed to clear character create draft:', error);
  }
}

export function isCharacterCreateDraftMeaningful(draft: CharacterCreateDraft): boolean {
  const f = draft.formData;
  return Boolean(
    f.briefDescription.trim() ||
      f.name.trim() ||
      f.appearance.trim() ||
      f.personality.trim() ||
      f.background.trim() ||
      f.portraitPrompts ||
      draft.lastAIResponse ||
      draft.lastAIDetails ||
      draft.taskIds.basicInfoTaskId ||
      draft.taskIds.portraitTaskId
  );
}

