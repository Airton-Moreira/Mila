// Builder de bloques UX interactivos para la interfaz del ChatBox

export interface UXBlock {
  type: "chart" | "table" | "kpis" | "alert" | "action";
  [key: string]: any;
}

export function buildUXBlocksFromToolResults(toolCalls: Array<{ name: string; result: any }>): UXBlock[] {
  const blocks: UXBlock[] = [];

  for (const call of toolCalls) {
    const { name, result } = call;
    if (!result || typeof result !== "object") continue;

    if (name === "get_sales_summary") {
      blocks.push({
        type: "kpis",
        items: [
          { label: "Ventas Totales", value: `$${Number(result.ventas_totales || 0).toLocaleString("es-AR")}`, trend: "up" },
          { label: "Utilidad Bruta", value: `$${Number(result.utilidad_bruta || 0).toLocaleString("es-AR")}`, trend: "up" },
          { label: "Margen %", value: `${result.margen_porcentaje || 0}%`, delta: `${result.margen_porcentaje}%` },
          { label: "Pedidos", value: `${result.cantidad_pedidos || 0}` }
        ]
      });
    } else if (name === "get_top_products") {
      const prods = result.productos || [];
      if (Array.isArray(prods) && prods.length > 0) {
        blocks.push({
          type: "chart",
          chart: "bar",
          title: `Top Productos por ${result.metrica || "ingresos"}`,
          labels: prods.map(p => p.producto),
          datasets: [
            {
              label: result.metrica === "unidades" ? "Unidades" : "ARS ($)",
              data: prods.map(p => result.metrica === "unidades" ? p.unidades : p.ingresos)
            }
          ],
          format: result.metrica === "unidades" ? "number" : "currency"
        });
      }
    } else if (name === "get_sales_by_weekday") {
      const dias = result.dias || [];
      if (Array.isArray(dias) && dias.length > 0) {
        blocks.push({
          type: "chart",
          chart: "bar",
          title: "Ventas por Día de la Semana",
          labels: dias.map(d => d.dia_nombre),
          datasets: [{ label: "Ingresos ($)", data: dias.map(d => d.ingresos) }],
          format: "currency"
        });
      }
    } else if (name === "get_alerts") {
      const stockBajo = result.stock_bajo || [];
      if (Array.isArray(stockBajo) && stockBajo.length > 0) {
        blocks.push({
          type: "alert",
          level: "warn",
          text: `⚠️ Alerta de Inventario: Hay ${stockBajo.length} insumo(s) con stock bajo (${stockBajo.map((i: any) => i.nombre).join(", ")}).`
        });
      }
    } else if (name === "check_production_feasibility") {
      if (result.factible === false) {
        blocks.push({
          type: "alert",
          level: "critical",
          text: `⛔ Stock Insuficiente: Faltan insumos para la producción. Costo estimado de reposición: $${Number(result.costo_reposicion_faltantes || 0).toLocaleString("es-AR")}.`
        });
      }
    }
  }

  return blocks;
}
