// src/controllers/teamsController.ts
import {
  getAthletesByTeam,
  getTeamsByOrgId,
  listTeamsWithAthletes,
} from "../services/teams.service.ts";
import {
  badRequest,
  internalError,
  json,
  methodNotAllowed,
} from "../utils/http.ts";
import type { TeamDTO } from "../dtos/team.dto.ts";
import type { RequestContext } from "../routes/router.ts";
import { RE_UUID } from "../utils/uuid.ts";

type GetTeamsSuccess = {
  ok: true;
  data: TeamDTO[];
};

type GetTeamsError = {
  ok: false;
  error: string;
};

type GetTeamsResponseBody = GetTeamsSuccess | GetTeamsError;

function jsonResponse(body: GetTeamsResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleTeamsWithAthletesList(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  ctx?: RequestContext,
): Promise<Response> {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const url = new URL(req.url);
    const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
    if (!RE_UUID.test(org_id)) {
      return badRequest("org_id (UUID) is required");
    }

    const { data, error } = await listTeamsWithAthletes(org_id);

    if (error) {
      console.error("[handleTeamsWithAthletesList] list error", error);
      return internalError(error);
    }

    const teams = data ?? [];

    return json(200, {
      ok: true,
      count: teams.length,
      data: teams,
    });
  } catch (err) {
    console.error("[handleTeamsWithAthletesList] error", err);
    return internalError(err);
  }
}


export async function getTeamsController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  ctx?: RequestContext,
): Promise<Response> {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const url = new URL(req.url);
    const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
    if (!RE_UUID.test(org_id)) {
      return badRequest("org_id (UUID) is required");
    }

    const teams: TeamDTO[] = await getTeamsByOrgId(org_id);

    const body: GetTeamsSuccess = {
      ok: true,
      data: teams,
    };

    return jsonResponse(body, 200);
  } catch (err) {
    console.error("getTeamsController unexpected error:", err);

    const body: GetTeamsError = {
      ok: false,
      error: "Unexpected error fetching teams",
    };

    return jsonResponse(body, 500);
  }
}


export async function handleAthletesByTeam(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  ctx?: RequestContext,
): Promise<Response> {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const url = new URL(req.url);
    const teamId = url.searchParams.get("team_id");
    const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();

    if (!teamId) {
      return badRequest("Query parameter 'team_id' is required.");
    }
    if (!RE_UUID.test(org_id)) {
      return badRequest("org_id (UUID) is required");
    }

    const { data, error } = await getAthletesByTeam(teamId, org_id);

    if (error) {
      console.error("[handleAthletesByTeam] error", error);
      return internalError(error);
    }

    const athletes = data ?? [];

    return json(200, {
      ok: true,
      count: athletes.length,
      data: athletes,
    });
  } catch (err) {
    console.error("[handleAthletesByTeam] unexpected error", err);
    return internalError(err);
  }
}
