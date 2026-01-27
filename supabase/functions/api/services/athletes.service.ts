import { sbAdmin } from "./supabase.ts";
import type {
  AthleteDto,
  AthleteListFilterInput,
  AthleteTeamDto,
  CreateAthleteInput,
  UpdateAthleteInput,
} from "../dtos/athletes.dto.ts";

function buildFullName(first?: string | null, last?: string | null): string | null {
  const parts = [first?.trim(), last?.trim()].filter((part) => part && part.length > 0) as string[];
  if (parts.length === 0) return null;
  return parts.join(" ");
}

function mapAthleteRow(row: any): AthleteDto {
  const profile = row.profile ?? null;
  const teamRows = Array.isArray(row.team_athletes)
    ? row.team_athletes
    : row.team_athletes
    ? [row.team_athletes]
    : [];

  const teamsById = new Map<string, AthleteTeamDto>();
  for (const item of teamRows) {
    const status = item?.status ?? null;
    if (status && status !== "active") continue;
    const team = item?.team ?? null;
    const teamId = item?.team_id ?? team?.id ?? null;
    if (!teamId) continue;
    if (!teamsById.has(teamId)) {
      teamsById.set(teamId, {
        id: teamId,
        name: team?.name ?? null,
      });
    }
  }

  return {
    id: row.id,
    org_id: row.org_id ?? null,
    user_id: row.user_id ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    full_name: row.full_name ?? null,
    email: profile?.email ?? row.email ?? null,
    phone: row.phone ?? null,
    cell_number: row.cell_number ?? null,
    graduation_year: row.graduation_year ?? null,
    teams: Array.from(teamsById.values()),
  };
}

export async function listAthletes(
  filters: AthleteListFilterInput,
): Promise<{ data: AthleteDto[]; count: number; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], count: 0, error: new Error("Supabase client not initialized") };
  }

  const { org_id, name, email, team_id, limit, offset } = filters;
  const rangeTo = offset + (limit - 1);

  const teamEmbed = team_id
    ? "team_athletes!inner(team_id, status, team:teams(id, name))"
    : "team_athletes(team_id, status, team:teams(id, name))";

  let query = client
    .from("athletes")
    .select(
      `
      id,
      org_id,
      user_id,
      email,
      first_name,
      last_name,
      full_name,
      phone,
      cell_number,
      graduation_year,
      profile:profiles(email),
      ${teamEmbed}
    `,
      { count: "exact" },
    )
    .eq("org_id", org_id)
    .range(offset, rangeTo)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (name) {
    query = query.or(
      `full_name.ilike.%${name}%,first_name.ilike.%${name}%,last_name.ilike.%${name}%`,
    );
  }
  if (email) {
    query = query.ilike("profiles.email", `%${email}%`);
  }
  if (team_id) {
    query = query.eq("team_athletes.team_id", team_id).eq("team_athletes.status", "active");
  }

  const { data, error, count } = await query;
  if (error) return { data: [], count: 0, error };

  const items = (data ?? []).map((row: any) => mapAthleteRow(row));
  return { data: items, count: count ?? items.length, error: null };
}

export async function getAthleteById(
  athlete_id: string,
  org_id: string,
): Promise<{ data: AthleteDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const { data, error } = await client
    .from("athletes")
    .select(
      `
      id,
      org_id,
      user_id,
      email,
      first_name,
      last_name,
      full_name,
      phone,
      cell_number,
      graduation_year,
      profile:profiles(email),
      team_athletes(team_id, status, team:teams(id, name))
    `,
    )
    .eq("id", athlete_id)
    .eq("org_id", org_id)
    .maybeSingle();

  if (error) return { data: null, error };

  return { data: data ? mapAthleteRow(data) : null, error: null };
}

export async function createAthlete(
  input: CreateAthleteInput,
): Promise<{ data: AthleteDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const full_name = input.full_name ?? buildFullName(input.first_name, input.last_name);

  const { data: created, error: createErr } = await client.auth.admin.createUser({
    email: input.email,
    password: input.password,
    user_metadata: {
      first_name: input.first_name,
      last_name: input.last_name,
      cell_number: input.cell_number ?? null,
    },
    app_metadata: { role: "athlete" },
    email_confirm: true,
  });

  if (createErr) {
    return { data: null, error: createErr };
  }

  const userId = created.user?.id ?? null;
  if (!userId) {
    return { data: null, error: new Error("User was not returned by Supabase") };
  }

  const { data: txData, error: txErr } = await client.rpc("create_athlete_tx", {
    p_user_id: userId,
    p_org_id: input.org_id,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_full_name: full_name,
    p_email: input.email,
    p_phone: input.phone ?? null,
    p_cell_number: input.cell_number ?? null,
    p_graduation_year: input.graduation_year ?? null,
  });

  if (txErr) {
    await client.auth.admin.deleteUser(userId).catch(() => {});
    return { data: null, error: txErr };
  }

  const athleteId =
    typeof txData === "string"
      ? txData
      : Array.isArray(txData)
      ? txData[0]?.athlete_id ?? null
      : (txData as any)?.athlete_id ?? null;

  if (!athleteId) {
    await client.auth.admin.deleteUser(userId).catch(() => {});
    return { data: null, error: new Error("Failed to create athlete") };
  }

  return await getAthleteById(athleteId, input.org_id);
}

export async function updateAthlete(
  athlete_id: string,
  org_id: string,
  input: UpdateAthleteInput,
): Promise<{ data: AthleteDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const patch: Record<string, unknown> = {};
  if (input.user_id !== undefined) patch.user_id = input.user_id;
  if (input.first_name !== undefined) patch.first_name = input.first_name;
  if (input.last_name !== undefined) patch.last_name = input.last_name;
  if (input.full_name !== undefined) patch.full_name = input.full_name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.cell_number !== undefined) patch.cell_number = input.cell_number;
  if (input.graduation_year !== undefined) patch.graduation_year = input.graduation_year;

  const needsFullName = input.full_name === undefined &&
    (input.first_name !== undefined || input.last_name !== undefined);

  if (needsFullName) {
    const { data: current, error: currentError } = await client
      .from("athletes")
      .select("first_name, last_name")
      .eq("id", athlete_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (currentError) return { data: null, error: currentError };
    if (!current) return { data: null, error: new Error("Athlete not found") };

    const mergedFirst = input.first_name ?? current.first_name ?? null;
    const mergedLast = input.last_name ?? current.last_name ?? null;
    patch.full_name = buildFullName(mergedFirst, mergedLast);
  }

  if (Object.keys(patch).length > 0) {
    const { data, error } = await client
      .from("athletes")
      .update(patch)
      .eq("id", athlete_id)
      .eq("org_id", org_id)
      .select("id");

    if (error) return { data: null, error };
    if (!data || data.length === 0) {
      return { data: null, error: new Error("Athlete not found") };
    }
  } else {
    const { data, error } = await client
      .from("athletes")
      .select("id")
      .eq("id", athlete_id)
      .eq("org_id", org_id);

    if (error) return { data: null, error };
    if (!data || data.length === 0) {
      return { data: null, error: new Error("Athlete not found") };
    }
  }

  return await getAthleteById(athlete_id, org_id);
}
