// Auth helper para validar JWT y obtener negocio_id del usuario
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface UserContext {
  userId: string;
  negocioId: string;
  email?: string;
  token: string;
  supabaseUserClient: any;
}

export async function verifyAuth(req: Request): Promise<UserContext | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Faltan variables SUPABASE_URL o SUPABASE_ANON_KEY");
    return null;
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: userErr } = await supabaseUserClient.auth.getUser();
  if (userErr || !user) {
    console.error("Token de autenticación inválido:", userErr);
    return null;
  }

  // Consultar negocio_id del usuario
  const { data: miembros, error: miemErr } = await supabaseUserClient
    .from("miembros")
    .select("negocio_id")
    .eq("user_id", user.id)
    .limit(1);

  if (miemErr || !miembros || miembros.length === 0) {
    console.error("Usuario sin negocio asignado:", miemErr);
    return null;
  }

  return {
    userId: user.id,
    negocioId: miembros[0].negocio_id,
    email: user.email,
    token,
    supabaseUserClient
  };
}
