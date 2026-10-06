import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export type Profile = {
  id: string;
  display_name: string;
  ubisoft_name: string;
  captain_opt_in: boolean;
  rating: number;
  wins: number;
  losses: number;
  is_admin: boolean;
};

export type QueueEntry = {
  user_id: string;
  mode: "captains" | "random";
  format: "bo1" | "bo3";
  batch_id: string | null;
  accepted: boolean;
  joined_at: string;
};

export type Match = {
  id: string;
  mode: "captains" | "random";
  format: "bo1" | "bo3";
  status: "draft" | "waiting_voice" | "veto" | "playing" | "disputed" | "completed" | "cancelled";
  draft_step: number;
  veto_step: number;
  first_veto_team: number;
  turn_deadline: string | null;
  map_pool: string[];
  voice_a: string | null;
  voice_b: string | null;
  voice_presence: Record<string, boolean>;
  voice_error: string | null;
  winning_team: number | null;
  created_at: string;
};

export type MatchPlayer = { match_id: string; user_id: string; team: number | null; is_captain: boolean; is_representative: boolean };
export type MapItem = { id: string; name: string; active: boolean; sort_order: number };
export type VetoAction = { match_id: string; step: number; team: number; kind: "ban" | "pick"; map_id: string };
export type SeriesMap = { match_id: string; slot: number; map_id: string; reported_by: string | null; reported_winner: number | null; winner_team: number | null };
