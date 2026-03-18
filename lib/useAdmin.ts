"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

const ADMIN_UUID = "2fc7703e-c987-489b-ab3c-43181b4ca24d";

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsAdmin(user?.id === ADMIN_UUID);
      setLoading(false);
    }
    checkAdmin();
  }, []);

  return { isAdmin, loading };
}
