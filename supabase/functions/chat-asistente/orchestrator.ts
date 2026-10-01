// Orquestador de llamadas al LLM (Anthropic Claude 3.5) con Tool-Use Loop
import { UserContext } from "./lib/auth.ts";
import { TOOL_SCHEMAS, executeTool } from "./tools/registry.ts";
import { buildSystemPrompt } from "./prompts/system.ts";
import { buildUXBlocksFromToolResults } from "./lib/blocks.ts";
import { logUsageRecord } from "./lib/audit.ts";

export interface OrchestratorInput {
  mensaje: string;
  conversacionId?: string;
  ctx: UserContext;
}

export interface OrchestratorOutput {
  conversation_id: string;
  message_id: string;
  mode: "recetas" | "produccion" | "negocio" | "general";
  message: string;
  blocks: any[];
  suggestions: string[];
  usage: { tokens_in: number; tokens_out: number };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    throw new Error("Falta configurar ANTHROPIC_API_KEY en los secretos de Supabase.");
  }

  const { ctx, mensaje } = input;
  const supabase = ctx.supabaseUserClient;

  // 1. Obtener o crear conversación
  let convId = input.conversacionId;
  if (!convId) {
    const { data: newConv, error: convErr } = await supabase
      .from("conversaciones")
      .insert({
        negocio_id: ctx.negocioId,
        user_id: ctx.userId,
        titulo: mensaje.slice(0, 40)
      })
      .select()
      .single();

    if (convErr || !newConv) {
      throw new Error("No se pudo crear la conversación");
    }
    convId = newConv.id;
  }

  // 2. Cargar estado conversacional (entidades + resumen + últimos 12 mensajes)
  const [{ data: estadoData }, { data: mensajesHistorial }] = await Promise.all([
    supabase.from("conversacion_estado").select("*").eq("conversacion_id", convId).single(),
    supabase.from("mensajes").select("*").eq("conversacion_id", convId).order("created_at", { ascending: true }).limit(12)
  ]);

  const entidades = estadoData?.entidades || {};
  const resumen = estadoData?.resumen || "";

  // 3. Registrar mensaje del usuario
  await supabase.from("mensajes").insert({
    conversacion_id: convId,
    role: "user",
    content: mensaje
  });

  // 4. Preparar historial para Anthropic
  const messages: any[] = [];
  if (Array.isArray(mensajesHistorial)) {
    for (const m of mensajesHistorial) {
      messages.push({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content
      });
    }
  }
  messages.push({ role: "user", content: mensaje });

  const systemPrompt = buildSystemPrompt({
    negocioNombre: "Mila · Gestión & Obrador",
    entidadesActivas: entidades,
    resumenConversacion: resumen
  });

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let iterations = 0;
  const maxIterations = 5;
  let finalResponseText = "";
  const executedToolCalls: Array<{ name: string; result: any }> = [];

  // 5. Loop de Herramientas (Tool-Use Loop)
  while (iterations < maxIterations) {
    iterations++;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL_MAIN") || "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOL_SCHEMAS,
        messages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Error Anthropic API:", data);
      throw new Error(data.error?.message || "Error de comunicación con el servicio de IA");
    }

    if (data.usage) {
      totalTokensIn += data.usage.input_tokens || 0;
      totalTokensOut += data.usage.output_tokens || 0;
    }

    const contentBlocks = data.content || [];
    const toolUseBlocks = contentBlocks.filter((b: any) => b.type === "tool_use");
    const textBlocks = contentBlocks.filter((b: any) => b.type === "text");

    if (textBlocks.length > 0) {
      finalResponseText += textBlocks.map((b: any) => b.text).join("\n");
    }

    if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
      break; // No hay más tool calls
    }

    // Agregar respuesta del modelo con tool_use al historial
    messages.push({ role: "assistant", content: contentBlocks });

    // Ejecutar cada tool call
    const toolResultContent: any[] = [];
    for (const toolUse of toolUseBlocks) {
      const { id: toolUseId, name, input: toolArgs } = toolUse;
      const { result, ok, error } = await executeTool(name, toolArgs, ctx, convId);
      executedToolCalls.push({ name, result });

      // Actualizar entidades activas según los argumentos de la tool
      if (toolArgs.period) entidades.periodo = toolArgs.period;
      if (toolArgs.product_id) entidades.producto = toolArgs.product_id;
      if (toolArgs.category) entidades.categoria = toolArgs.category;

      toolResultContent.push({
        type: "tool_result",
        tool_use_id: toolUseId,
        content: JSON.stringify(result || { error })
      });
    }

    messages.push({ role: "user", content: toolResultContent });
  }

  // 6. Clasificar Modo
  let mode: "recetas" | "produccion" | "negocio" | "general" = "general";
  const msgLower = mensaje.toLowerCase();
  if (msgLower.includes("receta") || msgLower.includes("ingrediente") || msgLower.includes("ganache") || msgLower.includes("bizcochuelo") || msgLower.includes("manteca") || msgLower.includes("harina")) {
    mode = "recetas";
  } else if (msgLower.includes("stock") || msgLower.includes("alcanza") || msgLower.includes("comprar") || msgLower.includes("producir")) {
    mode = "produccion";
  } else if (msgLower.includes("vend") || msgLower.includes("ganan") || msgLower.includes("factura") || msgLower.includes("costo") || msgLower.includes("margen") || msgLower.includes("mes") || msgLower.includes("pesos")) {
    mode = "negocio";
  }

  // 7. Construir Bloques UX dinámicos
  const blocks = buildUXBlocksFromToolResults(executedToolCalls);

  // 8. Sugerencias de seguimiento
  const suggestions = [
    "¿Podés mostrarme el detalle de utilidad?",
    "¿Qué otros insumos deberíamos reponer?",
    "¿Cuál fue el mejor producto del mes?"
  ];

  // 9. Persistir mensaje y estado en Supabase
  const { data: savedMsg } = await supabase
    .from("mensajes")
    .insert({
      conversacion_id: convId,
      role: "assistant",
      content: finalResponseText,
      blocks,
      mode
    })
    .select()
    .single();

  await supabase.from("conversacion_estado").upsert({
    conversacion_id: convId,
    entidades,
    resumen: resumen || `Conversación sobre ${mensaje.slice(0, 30)}`,
    updated_at: new Date().toISOString()
  });

  // Log usage
  await logUsageRecord({
    negocioId: ctx.negocioId,
    userId: ctx.userId,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    modelo: Deno.env.get("AI_MODEL_MAIN") || "claude-3-5-haiku-20241022"
  });

  return {
    conversation_id: convId,
    message_id: savedMsg?.id || window.crypto.randomUUID(),
    mode,
    message: finalResponseText,
    blocks,
    suggestions,
    usage: { tokens_in: totalTokensIn, tokens_out: totalTokensOut }
  };
}
