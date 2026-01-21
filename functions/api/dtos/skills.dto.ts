import { z } from "https://esm.sh/zod@3.23.8";
import type { DrillDto } from "./drills.dto.ts";
import { RE_UUID } from "../utils/uuid.ts";

const uuid = () => z.string().regex(RE_UUID, "Invalid UUID");

const SkillMediaTypeSchema = z.enum(["image", "video", "document", "link"]);

export const SkillMediaUploadSchema = z.object({
  org_id: uuid(),
  skill_id: uuid(),
  file_name: z.string().trim().min(1).max(255),
  content_type: z.string().trim().min(1).max(120),
  type: SkillMediaTypeSchema.optional(),
  media_type: SkillMediaTypeSchema.optional(),
  title: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  thumbnail_url: z.string()
    .url("thumbnail_url must be a valid URL")
    .optional()
    .nullable(),
  position: z.number({ coerce: true }).int().min(0).optional().nullable(),
});

export const CreateSkillMediaSchema = z
  .object({
    org_id: uuid(),
    skill_id: uuid(),
    type: SkillMediaTypeSchema.optional(),
    media_type: SkillMediaTypeSchema.optional(),
    url: z.string().url("url must be a valid URL").optional().nullable(),
    storage_path: z.string().trim().min(1).max(1024).optional().nullable(),
    title: z.string().trim().max(200).optional().nullable(),
    description: z.string().trim().max(4000).optional().nullable(),
    thumbnail_url: z.string()
      .url("thumbnail_url must be a valid URL")
      .optional()
      .nullable(),
    position: z.number({ coerce: true }).int().min(0).optional().nullable(),
  })
  .refine((data) => data.storage_path || data.url, {
    message: "storage_path or url is required",
  });

export const CreateSkillSchema = z.object({
  org_id: uuid(),
  sport_id: uuid().optional().nullable(),
  category: z.string().trim().min(1, "category is required").max(120),
  title: z.string().trim().min(1, "title is required").max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  level: z.string().trim().max(50).optional().nullable(),
  visibility: z.string().trim().max(50).optional().nullable(),
  status: z.string().trim().max(50).optional().nullable(),
});

export const UpdateSkillSchema = z.object({
  sport_id: uuid().optional().nullable(),
  category: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  level: z.string().trim().max(50).optional().nullable(),
  visibility: z.string().trim().max(50).optional().nullable(),
  status: z.string().trim().max(50).optional().nullable(),
});

const SkillDrillInputSchema = z
  .union([
    uuid(),
    z.object({
      drill_id: uuid(),
      level: z.number({ coerce: true }).int().min(0).optional().nullable(),
    }),
  ])
  .transform((value) => (typeof value === "string" ? { drill_id: value } : value));

export const AddSkillDrillsSchema = z.object({
  org_id: uuid(),
  drills: z.array(SkillDrillInputSchema).min(1, "drills is required"),
});

export const SkillDrillListFilterSchema = z.object({
  org_id: uuid(),
  limit: z.number({ coerce: true }).int().min(1).max(200).optional().default(50),
  offset: z.number({ coerce: true }).int().min(0).optional().default(0),
});

export const SkillListFilterSchema = z.object({
  org_id: uuid(),
  sport_id: uuid().optional().nullable(),
  q: z.string().trim().min(1).optional(),
  limit: z.number({ coerce: true }).int().min(1).max(200).optional().default(50),
  offset: z.number({ coerce: true }).int().min(0).optional().default(0),
});

export const SkillTagListFilterSchema = SkillListFilterSchema;

export const GetSkillByIdSchema = z.object({
  skill_id: uuid(),
});

export type SkillListFilterInput = z.infer<typeof SkillListFilterSchema>;
export type SkillTagListFilterInput = z.infer<typeof SkillTagListFilterSchema>;
export type SkillDrillListFilterInput = z.infer<typeof SkillDrillListFilterSchema>;

export type CreateSkillInput = z.infer<typeof CreateSkillSchema>;
export type UpdateSkillInput = z.infer<typeof UpdateSkillSchema>;
export type SkillDrillInput = z.infer<typeof SkillDrillInputSchema>;
export type AddSkillDrillsInput = z.infer<typeof AddSkillDrillsSchema>;
export type CreateSkillMediaInput = z.infer<typeof CreateSkillMediaSchema>;
export type SkillMediaUploadInput = z.infer<typeof SkillMediaUploadSchema>;

export type SkillMediaUploadResult = {
  bucket: string;
  path: string;
  signed_url: string;
  token: string;
  public_url: string;
};

export type SkillMediaRecordDto = {
  id: string;
  skill_id: string;
  type: string;
  url: string | null;
  storage_path: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  position: number | null;
};

export type SkillMediaPlaybackDto = {
  media: SkillMediaRecordDto;
  play_url: string;
  expires_in: number | null;
};

export type SkillDrillDto = {
  skill_id: string;
  drill_id: string;
  level: number | null;
  drill: DrillDto;
};

export type SkillDrillMapDto = {
  skill_id: string;
  drill_id: string;
  level: number | null;
};

export type SkillTagDto = {
  id: string;
  name: string;
};

export type SkillDto = {
  id: string;
  org_id: string | null;
  sport_id: string | null;
  category: string;
  title: string;
  description: string | null;
  level: string | null;
  visibility: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  media: SkillMediaRecordDto[];
};
