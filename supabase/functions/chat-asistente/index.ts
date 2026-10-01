// HTTP Handler de la Edge Function chat-asistente
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth } from "./lib/auth.ts";
import { checkRateLimit } from "./lib/ratelimit.ts";
import { runOrchestrator } from "./orchestrator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGINS") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificación de Autenticación mediante JWT Bearer
    const ctx = await verifyAuth(req);
    if (!ctx) {
      return new Response(
        JSON.stringify({ error: "No autorizado. Token de sesión inválido o expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Control de Rate Limiting y Cuota
    const rateCheck = checkRateLimit(ctx.userId, 30, 600000); // 30 req / 10 min
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "Límite de mensajes alcanzado. Por favor esperá unos minutos antes de consultar de nuevo." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parsear Body
    const body = await req.json();
    const { mensaje, conversation_id } = body;

    if (!mensaje || typeof mensaje !== "string" || mensaje.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "El mensaje no puede estar vacío." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mensaje.length > 2000) {
      return new Response(
        JSON.stringify({ error: "El mensaje supera el tamaño máximo permitido (2.000 caracteres)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Invocación del Orquestador de IA
    const responsePayload = await runOrchestrator({
      mensaje: mensaje.trim(),
      conversacionId: conversation_id,
      ctx
    });

    return new Response(
      JSON.stringify(responsePayload),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": rateCheck.remaining.toString()
        }
      }
    );
  } catch (err: any) {
    console.error("Error no capturado en Edge Function chat-asistente:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Error interno del servidor de IA" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
