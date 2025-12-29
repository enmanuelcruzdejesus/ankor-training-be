import { z } from "https://esm.sh/zod@3.23.8";
import { RE_UUID } from "../utils/uuid.ts";

const uuid = () => z.string().regex(RE_UUID, "Invalid UUID");

const segmentId = () => uuid();

const SkillTagInputSchema = z
  .union([uuid(), z.object({ skill_id: uuid() })])
  .transform((value) => (typeof value === "string" ? value : value.skill_id));

const DrillMediaTypeSchema = z.enum(["image", "video", "document", "link"]);

export const DrillMediaSchema = z.object({
  type: DrillMediaTypeSchema.default("image"),
  url: z.string().url("media.url must be a valid URL"),
  title: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  thumbnail_url: z.string()
    .url("thumbnail_url must be a valid URL")
    .optional()
    .nullable()
});

export const DrillMediaUploadSchema = z.object({
  org_id: uuid(),
  drill_id: uuid(),
  file_name: z.string().trim().min(1).max(255),
  content_type: z.string().trim().min(1).max(120),
  type: DrillMediaTypeSchema.default("video"),
  title: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  thumbnail_url: z.string()
    .url("thumbnail_url must be a valid URL")
    .optional()
    .nullable(),
  position: z.number({ coerce: true }).int().min(0).optional().nullable(),
});

export const CreateDrillMediaSchema = DrillMediaSchema.extend({
  drill_id: uuid(),
  type: DrillMediaTypeSchema.default("video"),
});

export const CreateDrillSchema = z.object({
  org_id: uuid(),
  segment_id: segmentId(),
  sport_id: uuid().optional().nullable(),
  name: z.string().trim().min(1, "name is required").max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  instructions: z.string().trim().max(4000).optional().nullable(),
  level: z.string().trim().max(50).optional().nullable(),
  min_age: z.number({ coerce: true }).int().min(0).optional().nullable(),
  max_age: z.number({ coerce: true }).int().min(0).optional().nullable(),
  duration_seconds: z.number({ coerce: true }).int().positive().optional().nullable(),
  created_by: uuid().optional(),
  media: z.array(DrillMediaSchema).default([]),
  skill_tags: z.array(SkillTagInputSchema).optional().default([]),
});

export const DrillListFilterSchema = z.object({
  org_id: uuid(),
  name: z.string().trim().min(1).optional(),
  segment_ids: z.array(uuid()).optional().default([]),
  min_age: z.number({ coerce: true }).int().min(0).optional().nullable(),
  max_age: z.number({ coerce: true }).int().min(0).optional().nullable(),
  min_players: z.number({ coerce: true }).int().min(0).optional().nullable(),
  max_players: z.number({ coerce: true }).int().min(0).optional().nullable(),
  skill_tag_ids: z.array(uuid()).optional().default([]),
  limit: z.number({ coerce: true }).int().min(1).max(200).optional().default(50),
  offset: z.number({ coerce: true }).int().min(0).optional().default(0),
});

export const GetDrillByIdSchema = z.object({
  drill_id: uuid(),
});

export type DrillListFilterInput = z.infer<typeof DrillListFilterSchema>;

export interface DrillListItemDto {
  id: string;
  org_id: string | null;
  segment_id: string | null;
  name: string;
  description: string | null;
  level: string | null;
  min_players: number | null;
  max_players: number | null;
  min_age: number | null;
  max_age: number | null;
  duration_min: number | null;
  visibility: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  segment: { id: string; name: string | null } | null;
  skill_tags: string[];
  media: DrillMediaDto[];
}

export type DrillMediaDto = z.infer<typeof DrillMediaSchema>;
export type CreateDrillInput = z.infer<typeof CreateDrillSchema>;
export type CreateDrillMediaInput = z.infer<typeof CreateDrillMediaSchema>;
export type DrillMediaUploadInput = z.infer<typeof DrillMediaUploadSchema>;

export type CreateDrillDto = Omit<CreateDrillInput, "skill_tags"> & {
  skill_tags: { skill_id: string }[];
};

export function normalizeCreateDrillDto(input: CreateDrillInput): CreateDrillDto {
  const skill_ids = Array.from(new Set(input.skill_tags));

  const media = input.media.map((item, index) => ({
    ...item,
    position: item.position ?? index + 1,
  }));

  return {
    ...input,
    media,
    skill_tags: skill_ids.map((skill_id) => ({ skill_id })),
  };
}
