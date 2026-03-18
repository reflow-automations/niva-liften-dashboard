-- ============================================================
-- RLS POLICIES voor Niva Liften Dashboard
-- Voer dit script uit in Supabase SQL Editor
-- ============================================================

-- 1. Enable RLS op alle tabellen
ALTER TABLE public.lifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noodoproepen ENABLE ROW LEVEL SECURITY;

-- 2. Policies: authenticated users mogen SELECT
CREATE POLICY "Authenticated users can view lifts"
  ON public.lifts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view call_logs"
  ON public.call_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view noodoproepen"
  ON public.noodoproepen
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Storage policies KUNNEN NIET via SQL Editor (ownership probleem).
--    Doe dit handmatig in Supabase Dashboard:
--
--    a) Ga naar Storage > klik "New Bucket" > naam: "recordings" > NIET public > Create
--    b) Klik op de "recordings" bucket > tabblad "Policies"
--    c) Klik "New Policy" > "For full customization"
--    d) Policy name: "Authenticated users can read recordings"
--    e) Allowed operation: SELECT
--    f) Target roles: authenticated
--    g) USING expression: true
--    h) Klik "Review" > "Save policy"
