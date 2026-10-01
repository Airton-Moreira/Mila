const SUPABASE_URL = "https://rvssvunhrgnbmdkwtvax.supabase.co";
const SUPABASE_KEY = "sb_publishable_SJljTLi-mSxCZYKhU6xreg_KTbS_7rV";

let supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === "function") {
  try {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );
    window.supabaseClient = supabaseClient;
  } catch (e) {
    console.warn("Mila: No se pudo inicializar supabaseClient:", e);
  }
}

async function probarSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from("negocios")
      .select("id, nombre, tipo_negocio");

    console.log("=== PRUEBA SUPABASE ===");
    console.log("DATA:", data);
    if (error) {
      console.warn("Supabase aviso:", error);
    } else {
      console.log("Supabase conectado correctamente.");
    }
  } catch (e) {
    console.warn("Supabase test error:", e);
  }
}
probarSupabase();