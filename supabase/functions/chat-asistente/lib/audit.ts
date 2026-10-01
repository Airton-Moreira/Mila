// Audit & Usage logger
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function logAuditRecord(record: {
  negocioId: string;
  userId: string;
  conversacionId?: string;
  toolName: string;
  args: any;
  filas?: number;
  duracionMs: number;
  ok: boolean;
  error?: string;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) return;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  await adminClient.from("ia_auditoria").insert({
    negocio_id: record.negocioId,
    user_id: record.userId,
    conversacion_id: record.conversacionId || null,
    tool_name: record.toolName,
    args: record.args,
    filas: record.filas || 0,
    duracion_ms: record.duracionMs,
    ok: record.ok,
    error: record.error || null
  });
}

export async function logUsageRecord(record: {
  negocioId: string;
  userId: string;
  tokensIn: number;
  tokensOut: number;
  modelo: string;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) return;

  // Costo estimado Anthropic Claude 3.5 Haiku ($0.80 / 1M input, $4.00 / 1M output)
  const costIn = (record.tokensIn / 1_000_000) * 0.80;
  const costOut = (record.tokensOut / 1_000_000) * 4.00;
  const costoTotal = costIn + costOut;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  await adminClient.from("ia_uso").insert({
    negocio_id: record.negocioId,
    user_id: record.userId,
    tokens_in: record.tokensIn,
    tokens_out: record.tokensOut,
    modelo: record.modelo,
    costo_estimado: costoTotal
  });
}
