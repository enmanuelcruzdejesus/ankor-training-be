// src/services/teams.service.ts
import { sbAdmin } from "./supabase.ts";
import { TeamDTO } from "../dtos/team.dto.ts";


export type TeamAthlete = {
  team_id: string;
  id: string; // athlete id
  org_id: string | null;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  graduation_year: number | null;
  cell_number: string | null;
};

export async function listTeamsWithAthletes(): Promise<{
  data: any[] | null;
  error: unknown;
}> {
  const { data, error } = await sbAdmin!
    .from("teams")
    .select(`
      id,
      org_id,
      name,
      created_at,
      athletes:athletes (
        id,
        profile:profiles (
          first_name,
          last_name
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error };
  }

  // Normalize shape + flatten athlete name fields
  const mapped = (data ?? []).map((row: any) => ({
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    created_at: row.created_at,
    athletes: (row.athletes ?? []).map((a: any) => ({
      id: a.id,
      first_name: a.profile?.first_name ?? null,
      last_name: a.profile?.last_name ?? null,
    })),
  }));

  return { data: mapped, error: null };
}

export async function getAllTeams(): Promise<TeamDTO[]> {
  if (!sbAdmin) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await sbAdmin
    .from("teams")
    .select("id, org_id, name,  is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("getAllTeams error:", error);
    throw new Error("Failed to fetch teams");
  }

  return data ?? [];
}

export async function getTeamsByOrgId(orgId: string): Promise<TeamDTO[]> {
  if (!sbAdmin) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await sbAdmin
    .from("teams")
    .select("id, org_id, name, level, gender, season, is_active, join_code")
    .eq("org_id", orgId)
    .order("name", { ascending: true });

  if (error) {
    console.error("getTeamsByOrgId error:", error);
    throw new Error("Failed to fetch teams");
  }

  return data ?? [];
}

export async function getAthletesByTeam(
  teamId: string,
): Promise<{ data: TeamAthlete[] | null; error: unknown }> {
  const { data, error } = await sbAdmin!
    .from("team_athletes")
    .select(
      `
      team_id,
      athlete:athletes (
        id,
        org_id,
        user_id,
        first_name,
        last_name,
        full_name,
        phone,
        graduation_year,
        cell_number
      )
    `,
    )
    .eq("team_id", teamId)
    .eq("status", "active");

  if (error) {
    return { data: null, error };
  }

  const mapped: TeamAthlete[] = (data ?? []).map((row: any) => ({
    team_id: row.team_id,
    id: row.athlete?.id ?? null,
    org_id: row.athlete?.org_id ?? null,
    user_id: row.athlete?.user_id ?? null,
    first_name: row.athlete?.first_name ?? null,
    last_name: row.athlete?.last_name ?? null,
    full_name: row.athlete?.full_name ?? null,
    phone: row.athlete?.phone ?? null,
    graduation_year: row.athlete?.graduation_year ?? null,
    cell_number: row.athlete?.cell_number ?? null,
  }));

  return { data: mapped, error: null };
}