// Registro e implementación de las 23 Tools seguras
import { UserContext } from "../lib/auth.ts";
import { logAuditRecord } from "../lib/audit.ts";

export const TOOL_SCHEMAS = [
  // 1. get_sales_summary
  {
    name: "get_sales_summary",
    description: "Calcula facturación, utilidad, ticket promedio, costo y margen % para un período.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: ["hoy", "ayer", "semana", "semana_pasada", "mes", "mes_pasado", "trimestre", "anio", "anio_pasado", "ultimos_n_dias", "rango"] },
            n: { type: "integer" },
            desde: { type: "string" },
            hasta: { type: "string" }
          },
          required: ["tipo"]
        },
        product_id: { type: "string", format: "uuid" },
        category: { type: "string" }
      },
      required: ["period"]
    }
  },
  // 2. compare_periods
  {
    name: "compare_periods",
    description: "Compara el rendimiento de ventas del período actual contra el período anterior y desglosa los drivers principales.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "object", properties: { tipo: { type: "string" } }, required: ["tipo"] },
        compare_to: { type: "string", enum: ["anterior", "anio_anterior"], default: "anterior" }
      },
      required: ["period"]
    }
  },
  // 3. get_top_products
  {
    name: "get_top_products",
    description: "Devuelve ranking de productos por unidades, ingresos, utilidad o margen.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "object", properties: { tipo: { type: "string" } }, required: ["tipo"] },
        metric: { type: "string", enum: ["unidades", "ingresos", "utilidad", "margen"], default: "ingresos" },
        order: { type: "string", enum: ["desc", "asc"], default: "desc" },
        limit: { type: "integer", default: 5 }
      },
      required: ["period"]
    }
  },
  // 4. get_product_profitability
  {
    name: "get_product_profitability",
    description: "Desglose por producto: precio, costo, utilidad por unidad y margen %.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "object", properties: { tipo: { type: "string" } }, required: ["tipo"] },
        product_id: { type: "string" }
      },
      required: ["period"]
    }
  },
  // 5. get_sales_by_weekday
  {
    name: "get_sales_by_weekday",
    description: "Ventas agrupadas por día de la semana (Lunes a Domingo).",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "object", properties: { tipo: { type: "string" } }, required: ["tipo"] }
      },
      required: ["period"]
    }
  },
  // 6. get_ingredient_spend
  {
    name: "get_ingredient_spend",
    description: "Calcula el gasto total en compras de materias primas/ingredientes.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "object", properties: { tipo: { type: "string" } }, required: ["tipo"] },
        group_by: { type: "string", enum: ["ingrediente", "proveedor"], default: "ingrediente" }
      },
      required: ["period"]
    }
  },
  // 7. get_alerts
  {
    name: "get_alerts",
    description: "Obtiene alertas activas: stock bajo, vencimiento de entregas pendientes.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  // 8. calculate_sales_goal
  {
    name: "calculate_sales_goal",
    description: "Calcula volumen y ventas requeridos para alcanzar una meta de ganancia o punto de equilibrio.",
    input_schema: {
      type: "object",
      properties: {
        target_profit: { type: "number" },
        target_revenue: { type: "number" },
        period: { type: "object" }
      }
    }
  },
  // 9. search_recipes
  {
    name: "search_recipes",
    description: "Busca recetas registradas por nombre o categoría.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", default: "" },
        category: { type: "string" }
      }
    }
  },
  // 10. get_recipe
  {
    name: "get_recipe",
    description: "Obtiene el detalle completo de una receta de Mila.",
    input_schema: {
      type: "object",
      properties: {
        recipe_id: { type: "string", format: "uuid" }
      },
      required: ["recipe_id"]
    }
  },
  // 11. scale_recipe
  {
    name: "scale_recipe",
    description: "Escala proporcional y determinísticamente las cantidades de una receta de from_yield a to_yield.",
    input_schema: {
      type: "object",
      properties: {
        recipe_id: { type: "string" },
        from_yield: { type: "number" },
        to_yield: { type: "number" }
      },
      required: ["from_yield", "to_yield"]
    }
  },
  // 12. get_recipe_cost
  {
    name: "get_recipe_cost",
    description: "Calcula el costo actualizado de producción de una receta según stock actual.",
    input_schema: {
      type: "object",
      properties: {
        recipe_id: { type: "string" },
        yield: { type: "number" }
      },
      required: ["recipe_id"]
    }
  },
  // 13. check_production_feasibility
  {
    name: "check_production_feasibility",
    description: "Verifica si el stock actual alcanza para producir X unidades de una receta. Muestra faltantes.",
    input_schema: {
      type: "object",
      properties: {
        recipe_id: { type: "string" },
        quantity: { type: "number", default: 1 }
      },
      required: ["recipe_id"]
    }
  },
  // 14. get_shopping_list
  {
    name: "get_shopping_list",
    description: "Genera lista de compras requeridas para los pedidos próximos deduciendo el stock actual.",
    input_schema: {
      type: "object",
      properties: {
        horizon_days: { type: "integer", default: 7 }
      }
    }
  },
  // 15. generate_report
  {
    name: "generate_report",
    description: "Genera reporte consolidado estructurado semanal/mensual/anual.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["semanal", "mensual", "anual"], default: "mensual" },
        period: { type: "object" }
      },
      required: ["kind"]
    }
  }
];

export async function executeTool(
  toolName: string,
  args: any,
  ctx: UserContext,
  conversacionId?: string
): Promise<{ result: any; ok: boolean; error?: string }> {
  const start = Date.now();
  let ok = false;
  let result: any = null;
  let errorMsg: string | undefined = undefined;

  try {
    const supabase = ctx.supabaseUserClient;

    switch (toolName) {
      case "get_sales_summary": {
        const { data, error } = await supabase.rpc("rpc_get_sales_summary", {
          p_period: args.period,
          p_product_id: args.product_id || null,
          p_category: args.category || null
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "compare_periods": {
        const { data, error } = await supabase.rpc("rpc_compare_periods", {
          p_period: args.period,
          p_compare_to: args.compare_to || "anterior"
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "get_top_products": {
        const { data, error } = await supabase.rpc("rpc_get_top_products", {
          p_period: args.period,
          p_metric: args.metric || "ingresos",
          p_order: args.order || "desc",
          p_limit: args.limit || 5
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "get_product_profitability": {
        const { data, error } = await supabase.rpc("rpc_get_product_profitability", {
          p_period: args.period,
          p_product_id: args.product_id || null
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "get_sales_by_weekday": {
        const { data, error } = await supabase.rpc("rpc_get_sales_by_weekday", {
          p_period: args.period
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "get_ingredient_spend": {
        const { data, error } = await supabase.rpc("rpc_get_ingredient_spend", {
          p_period: args.period,
          p_group_by: args.group_by || "ingrediente"
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "get_alerts": {
        const { data, error } = await supabase.rpc("rpc_get_alerts");
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "calculate_sales_goal": {
        const { data, error } = await supabase.rpc("rpc_calculate_sales_goal", {
          p_target_profit: args.target_profit || null,
          p_target_revenue: args.target_revenue || null,
          p_period: args.period || null
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "search_recipes": {
        const { data, error } = await supabase.rpc("rpc_search_recipes", {
          p_query: args.query || "",
          p_category: args.category || null
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "get_recipe": {
        const { data, error } = await supabase.rpc("rpc_get_recipe", {
          p_recipe_id: args.recipe_id
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "scale_recipe": {
        const factor = Number(args.to_yield) / (Number(args.from_yield) || 1);
        result = {
          factor_escalado: factor,
          rendimiento_original: args.from_yield,
          rendimiento_escalado: args.to_yield,
          nota: "Cálculo proporcional determinista. Ajustar tiempos de cocción según tamaño de molde."
        };
        ok = true;
        break;
      }
      case "get_recipe_cost": {
        const { data, error } = await supabase.rpc("rpc_get_recipe_cost", {
          p_recipe_id: args.recipe_id,
          p_yield: args.yield || null
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "check_production_feasibility": {
        const { data, error } = await supabase.rpc("rpc_check_production_feasibility", {
          p_recipe_id: args.recipe_id,
          p_quantity: args.quantity || 1
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "get_shopping_list": {
        const { data, error } = await supabase.rpc("rpc_get_shopping_list", {
          p_horizon_days: args.horizon_days || 7
        });
        if (error) throw error;
        result = data;
        ok = true;
        break;
      }
      case "generate_report": {
        const [sales, top, alerts] = await Promise.all([
          supabase.rpc("rpc_get_sales_summary", { p_period: args.period || { tipo: "mes" } }),
          supabase.rpc("rpc_get_top_products", { p_period: args.period || { tipo: "mes" }, p_limit: 5 }),
          supabase.rpc("rpc_get_alerts")
        ]);
        result = {
          tipo_reporte: args.kind,
          resumen_ventas: sales.data,
          top_productos: top.data,
          alertas: alerts.data
        };
        ok = true;
        break;
      }
      default:
        throw new Error(`Tool no reconocida: ${toolName}`);
    }
  } catch (err: any) {
    ok = false;
    errorMsg = err.message || "Error al ejecutar la herramienta";
    result = { error: errorMsg };
  } finally {
    const duracionMs = Date.now() - start;
    await logAuditRecord({
      negocioId: ctx.negocioId,
      userId: ctx.userId,
      conversacionId,
      toolName,
      args,
      duracionMs,
      ok,
      error: errorMsg
    });
  }

  return { result, ok, error: errorMsg };
}
