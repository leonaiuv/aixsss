import { z } from 'zod';

export const RelationshipTypeSchema = z.enum([
  'family',
  'romantic',
  'friendship',
  'rivalry',
  'mentorship',
  'alliance',
  'subordinate',
  'enemy',
  'stranger',
  'custom',
]);

export const CharacterRelationshipArcPointSchema = z.object({
  episodeOrder: z.number().int(),
  change: z.string().max(500),
  newIntensity: z.number().int().min(1).max(10),
});

export const CharacterRelationshipSchema = z.object({
  id: z.string().min(1),
  fromCharacterId: z.string().min(1),
  toCharacterId: z.string().min(1),
  type: RelationshipTypeSchema,
  label: z.string().max(60),
  description: z.string().max(2000).default(''),
  intensity: z.number().int().min(1).max(10).default(5),
  arc: z.array(CharacterRelationshipArcPointSchema).default([]),
});

export type CharacterRelationship = z.infer<typeof CharacterRelationshipSchema>;
