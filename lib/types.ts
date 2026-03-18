export interface Lift {
  id: string;
  phone_number: string;
  address: string;
  bedrijf: string;
  postcode: string;
  stad: string;
  is_active: boolean;
  last_test_at: string | null;
  created_at: string;
}

export interface CallLog {
  id: string;
  lift_id: string;
  call_sid: string;
  retell_call_id: string | null;
  trace_id: string | null;
  call_type: "test_automatisch" | "test" | "noodoproep" | "onbekend";
  status: "test_succes" | "noodoproep_actief" | "mens_geescaleerd" | "ai_afgehandeld" | "onbekend";
  from_number: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  audio_url: string | null;
  summary: string | null;
  sentiment: string | null;
  language: string | null;
  occupancy: string | null;
  call_cost_usd: number | null;
  fallback_reason: string | null;
  model_llm_version: string | null;
  is_anonymized: boolean | null;
  anonymized_at: string | null;
  queue_time_ms: number | null;
  avg_confidence_score: number | null;
  created_at: string;
  // Joined lift data
  lifts?: Lift;
}

export interface Noodoproep {
  id: string;
  locatie: string;
  datum: string;
  created_at: string;
}

export type CallType = CallLog["call_type"];
export type CallStatus = CallLog["status"];
