// src/controllers/teamsController.ts
import { listTeamsWithAthletes } from "../services/teams.service.ts";
import {
  badRequest,
  internalError,
  json,
  methodNotAllowed,
} from "../utils/http.ts";
import type { TeamDTO } from "../dtos/team.dto.ts";
import { getAllTeams,getAthletesByTeam  } from "../services/teams.service.ts";

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
): Promise<Response> {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const { data, error } = await listTeamsWithAthletes();

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


export async function getTeamsController(req: Request): Promise<Response> {
  try {
    // No org_id filtering for now – just return all teams
    const teams: TeamDTO[] = await getAllTeams();

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
): Promise<Response> {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const url = new URL(req.url);
    const teamId = url.searchParams.get("team_id");

    if (!teamId) {
      return badRequest("Query parameter 'team_id' is required.");
    }

    const { data, error } = await getAthletesByTeam(teamId);

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