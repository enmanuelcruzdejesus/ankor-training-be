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

export async function listTeamsWithAthletes(org_id: string): Promise<{
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
    .eq("org_id", org_id)
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
    .select("id, org_id, name, is_active")
    .eq("org_id", orgId)
    .order("name", { ascending: true });

  if (error) {
    console.error("getTeamsByOrgId error:", error);
    throw new Error("Failed to fetch teams");
  }

  const mapped = (data ?? []).map((row: any) => ({
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    is_active: row.is_active ?? false,
  }));

  return mapped;
}

export async function getAthletesByTeam(
  teamId: string,
  org_id: string,
): Promise<{ data: TeamAthlete[] | null; error: unknown }> {
  const { data, error } = await sbAdmin!
    .from("team_athletes")
    .select(`
      team_id,
      teams!inner(org_id),
      athlete:athletes (
        id,
        org_id,
        user_id,
        first_name,
        last_name,
        full_name,
        phone,
        graduation_year,
        cell_number,
        athlete_positions!inner (
          position
        )
      )
    `)
    .eq("team_id", teamId)
    .eq("teams.org_id", org_id)
    .eq("status", "active");

  if (error) {
    return { data: null, error };
  }

  const mapped: TeamAthlete[] = (data ?? []).map((row: any) => {
    const a = row.athlete ?? {};

    const rawPos = a.athlete_positions;
    const position = Array.isArray(rawPos)
      ? rawPos[0]?.position ?? null
      : rawPos?.position ?? null;

    return {
      team_id: row.team_id,
      id: a.id ?? null,
      org_id: a.org_id ?? null,
      user_id: a.user_id ?? null,
      first_name: a.first_name ?? null,
      last_name: a.last_name ?? null,
      full_name: a.full_name ?? null,
      phone: a.phone ?? null,
      graduation_year: a.graduation_year ?? null,
      cell_number: a.cell_number ?? null,
      position,
    };
  });

  return { data: mapped, error: null };
}
