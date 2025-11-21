// src/schemas/evaluations.ts

export interface EvaluationItemInput {
  skill_id: string;
  rating: number;
  comments?: string | null;
}

export interface EvaluationInput {
  org_id: string;
  scorecard_template_id: string;
  athlete_id: string;
  coach_id: string;
  notes?: string | null;
  evaluation_items: EvaluationItemInput[];
}

export interface EvaluationWithItems {
  id: string;
  org_id: string;
  scorecard_template_id: string;
  athlete_id: string;
  coach_id: string;
  notes: string | null;
  created_at: string;
  evaluation_items: {
    id: string;
    evaluation_id: string;
    skill_id: string;
    rating: number;
    comments: string | null;
    created_at: string;
  }[];
}
