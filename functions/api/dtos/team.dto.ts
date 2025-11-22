// src/dtos/team.dto.ts

export type TeamDTO = {
  id: string;
  org_id: string;
  name: string;
  level: string | null;
  gender: string | null;
  season: string | null;
  is_active: boolean;
  join_code: string | null;
};