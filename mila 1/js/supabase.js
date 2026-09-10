const SUPABASE_URL = "https://rvssvunhrgnbmdkwtvax.supabase.co";
const SUPABASE_KEY = "sb_publishable_SJljTLi-mSxCZYKhU6xreg_KTbS_7rV"; // sb_publishable_SJljTLi-mSxCZYKhU6xreg_KTbS_7rV

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

async function probarSupabase() {
    const { data, error } = await supabaseClient
        .from("negocios")
        .select("id, nombre, tipo_negocio")
        .limit(1);

    if (error) {
        console.error("Error conectando con Supabase:", error);
        return;
    }

    console.log("Supabase conectado correctamente:");
    console.log(data);
}

probarSupabase();