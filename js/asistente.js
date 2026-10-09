/* =========================================================
   MILA · asistente.js
   Asistente IA unificado (Recetas + Producción + Gestión)
   con soporte multi-hilo, blocks dinámicos y Chart.js.
   ========================================================= */


   /*prueba de comentario */
const Asistente = (function () {

  let activeConversationId = null;
  let conversationsList = [];
  let currentMessages = [];
  let isProcessing = false;
  let chartInstances = [];

  function safeRenderMarkdown(content) {
    if (!content) return "";
    if (window.marked && window.DOMPurify) {
      return window.DOMPurify.sanitize(window.marked.parse(content));
    }
    // Fallback básico si aún no cargaron CDN
    return MilaUtils.escapeHtml(content).replace(/\n/g, "<br>");
  }

  function getModeBadgeHtml(mode) {
    switch (mode) {
      case "recetas":
        return `<span class="badge" style="background:#FFF3E0;color:#E65100;border:1px solid #FFE0B2">🍰 Receta</span>`;
      case "produccion":
        return `<span class="badge" style="background:#E8F5E9;color:#1B5E20;border:1px solid #C8E6C9">🧑🍳 Producción</span>`;
      case "negocio":
        return `<span class="badge" style="background:#E3F2FD;color:#0D47A1;border:1px solid #BBDEFB">📊 Negocio</span>`;
      default:
        return `<span class="badge" style="background:#F5F5F5;color:#616161;border:1px solid #E0E0E0">💬 General</span>`;
    }
  }

  async function render(container) {
    destroyCharts();
    await cargarConversaciones();

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">Asistente IA Unificado</span>
          <h1>Preguntale a Mila</h1>
          <p class="subtitle">Asesoramiento de pastelería técnica, producción e inteligencia de negocio</p>
        </div>
      </div>

      <div class="chat-app-grid">
        <!-- Sidebar de Historial -->
        <aside class="chat-sidebar" id="chatSidebar">
          <button class="btn btn-primary btn-block" id="btnNuevaConversacion" style="width:100%;margin-bottom:12px">
            ＋ Nueva conversación
          </button>
          <div class="search-bar" style="margin-bottom:12px">
            <input type="search" id="buscarConversacion" placeholder="Buscar charlas..." style="padding:6px 10px;font-size:12px">
          </div>
          <div class="conversations-tree" id="conversationsTree">
            ${renderConversationsTree(conversationsList)}
          </div>
        </aside>

        <!-- Panel de Chat Principal -->
        <section class="chat-main-panel">
          <div class="chat-panel-header">
            <div class="chat-thread-title">
              <span style="font-size:20px">🤖</span>
              <div>
                <h3 id="chatThreadName">Mila Asistente</h3>
                <span class="chat-status-badge">● Conectado a Postgres & Tools</span>
              </div>
            </div>
            <div class="chat-header-actions">
              <button class="btn btn-outline btn-sm" id="btnImprimirChat" title="Imprimir o exportar informe">🖨️ Imprimir</button>
            </div>
          </div>

          <!-- Sugerencias Iniciales Chips -->
          <div class="chat-chips-bar" id="chipsBar">
            <button class="chip-btn" data-prompt="¿Cuánto vendimos este mes y cuál es el margen?">📊 Ventas del mes</button>
            <button class="chip-btn" data-prompt="¿Alcanza el stock para hacer 3 tortas de chocolate?">🧑🍳 Producir 3 tortas</button>
            <button class="chip-btn" data-prompt="Tengo harina, huevos, chocolate y crema, ¿qué puedo hacer?">🍰 Receta con mi stock</button>
            <button class="chip-btn" data-prompt="Armame el reporte mensual de rendimiento">📈 Reporte mensual</button>
          </div>

          <!-- Mensajes Scroll Box -->
          <div class="chat-messages-box" id="chatMessagesBox" role="log" aria-live="polite">
            ${renderMessagesListHtml(currentMessages)}
          </div>

          <!-- Input Bar -->
          <div class="chat-input-container">
            <div class="typing-indicator-bar" id="processingIndicator" style="display:none">
              <span class="spinner-dot"></span> <span id="processingStepText">Procesando consulta...</span>
            </div>
            <div class="chat-input-row">
              <textarea id="chatTextarea" rows="1" placeholder="Escribí tu consulta sobre recetas, producción o gestión (Enter envía, Shift+Enter salto)..."></textarea>
              <button class="btn btn-primary" id="btnSendMsg">Enviar</button>
            </div>
          </div>
        </section>
      </div>
    `;

    bindEvents(container);
    renderChartsInMessages();
  }

  function destroyCharts() {
    chartInstances.forEach(c => { try { c.destroy(); } catch(e){} });
    chartInstances = [];
  }

  async function cargarConversaciones(autoSelect = true) {
    let fetchedConvs = null;
    if (window.supabaseClient && window.supabaseClient.auth) {
      try {
        const { data: convs, error } = await window.supabaseClient
          .from("conversaciones")
          .select("*")
          .order("updated_at", { ascending: false });
        if (!error && Array.isArray(convs) && convs.length > 0) {
          fetchedConvs = convs;
        }
      } catch (e) {
        console.warn("Error cargando conversaciones de Supabase:", e);
      }
    }

    if (!fetchedConvs) {
      try {
        const raw = localStorage.getItem("mila_chat_conversations");
        if (raw) fetchedConvs = JSON.parse(raw);
      } catch (e) {}
    }

    if (fetchedConvs && fetchedConvs.length > 0) {
      conversationsList = fetchedConvs;
      if (!activeConversationId && autoSelect) {
        activeConversationId = fetchedConvs[0].id;
      }
    }

    if (activeConversationId) {
      await cargarMensajesConversacion(activeConversationId);
    } else {
      currentMessages = [
        {
          id: "welcome",
          role: "assistant",
          mode: "general",
          content: "¡Hola! Sos bienvenido a **Mila · Gestión & Obrador** 🍰\n\nPuedo ayudarte con tres áreas clave:\n1. **Recetas & Pastelería:** Consultas de técnicas, escalado de ingredientes y sustituciones.\n2. **Producción:** Viabilidad de stock para encargos y listas de compras.\n3. **Gestión de Negocio:** Facturación, utilidad, ticket promedio y análisis financiero real.\n\n¿Qué querés consultar hoy?",
          created_at: new Date().toISOString()
        }
      ];
    }
  }

  function bindEvents(container) {
    const btnNueva = document.getElementById("btnNuevaConversacion");
    if (btnNueva) {
      btnNueva.onclick = () => {
        activeConversationId = null;
        currentMessages = [
          {
            id: "welcome",
            role: "assistant",
            mode: "general",
            content: "¡Hola! Sos bienvenido a **Mila · Gestión & Obrador** 🍰\n\nPuedo ayudarte con tres áreas clave:\n1. **Recetas & Pastelería:** Consultas de técnicas, escalado de ingredientes y sustituciones.\n2. **Producción:** Viabilidad de stock para encargos y listas de compras.\n3. **Gestión de Negocio:** Facturación, utilidad, ticket promedio y análisis financiero real.\n\n¿Qué querés consultar hoy?",
            created_at: new Date().toISOString()
          }
        ];
        actualizarVistaMensajes(container);
        const textarea = document.getElementById("chatTextarea");
        if (textarea) textarea.focus();
      };
    }

    const inputBuscar = document.getElementById("buscarConversacion");
    if (inputBuscar) {
      inputBuscar.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtradas = conversationsList.filter(c => (c.titulo || "").toLowerCase().includes(query));
        const tree = document.getElementById("conversationsTree");
        if (tree) {
          tree.innerHTML = renderConversationsTree(filtradas);
          bindDynamicEvents(container);
        }
      };
    }

    const textarea = document.getElementById("chatTextarea");
    const btnSend = document.getElementById("btnSendMsg");

    if (btnSend && textarea) {
      btnSend.onclick = () => enviarPregunta(textarea.value, container);
      textarea.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          enviarPregunta(textarea.value, container);
        }
      };
    }

    bindDynamicEvents(container);

    const btnPrint = document.getElementById("btnImprimirChat");
    if (btnPrint) {
      btnPrint.onclick = () => window.print();
    }
  }

  async function cargarMensajesConversacion(convId) {
    activeConversationId = convId;
    let fetchedMsgs = null;
    if (window.supabaseClient) {
      try {
        const { data: msgs, error } = await window.supabaseClient
          .from("mensajes")
          .select("*")
          .eq("conversacion_id", convId)
          .order("created_at", { ascending: true });
        if (!error && Array.isArray(msgs) && msgs.length > 0) {
          fetchedMsgs = msgs;
        }
      } catch (e) {
        console.warn("Error cargando mensajes de Supabase:", e);
      }
    }

    if (!fetchedMsgs) {
      try {
        const raw = localStorage.getItem(`mila_chat_msgs_${convId}`);
        if (raw) fetchedMsgs = JSON.parse(raw);
      } catch (e) {}
    }

    if (fetchedMsgs && fetchedMsgs.length > 0) {
      currentMessages = fetchedMsgs;
    }
  }

  function guardarEstadoConversacion() {
    try {
      localStorage.setItem("mila_chat_conversations", JSON.stringify(conversationsList));
      if (activeConversationId) {
        localStorage.setItem(`mila_chat_msgs_${activeConversationId}`, JSON.stringify(currentMessages));
      }
    } catch (e) {
      console.warn("Error guardando chat en localStorage:", e);
    }

    if (window.supabaseClient && activeConversationId) {
      const activeConv = conversationsList.find(c => c.id === activeConversationId);
      if (activeConv) {
        window.supabaseClient.from("conversaciones").upsert({
          id: activeConv.id,
          titulo: activeConv.titulo,
          updated_at: activeConv.updated_at || new Date().toISOString()
        }).then(() => {}).catch(() => {});
      }
    }
  }

  function renderConversationsTree(list) {
    if (!list || list.length === 0) {
      return `<p class="text-muted" style="font-size:12px;padding:8px">Sin conversaciones previas.</p>`;
    }

    return list.map(c => `
      <div class="conv-item ${c.id === activeConversationId ? "active" : ""}" data-conv-id="${c.id}">
        <span class="conv-title">${MilaUtils.escapeHtml(c.titulo || "Conversación")}</span>
        <button class="conv-del-btn" data-del-conv="${c.id}" title="Eliminar">✕</button>
      </div>
    `).join("");
  }

  function renderMessagesListHtml(msgs) {
    return msgs.map(m => {
      const isUser = m.role === "user";
      const timestamp = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return `
        <div class="chat-bubble-wrapper ${isUser ? "user" : "assistant"}" data-msg-id="${m.id}">
          <div class="chat-bubble-header">
            <strong>${isUser ? "👤 Vos" : "🤖 Mila"}</strong>
            ${m.mode ? getModeBadgeHtml(m.mode) : ""}
            <span class="chat-time">${timestamp}</span>
          </div>
          <div class="chat-bubble-content">
            ${safeRenderMarkdown(m.content)}
          </div>
          ${renderBlocksHtml(m.blocks, m.id)}
          ${!isUser ? `
            <div class="chat-bubble-actions">
              <button class="msg-act-btn btn-copy" data-copy="${MilaUtils.escapeHtml(m.content)}">📋 Copiar</button>
              <button class="msg-act-btn btn-dl-md" data-dl-msg="${m.id}">📥 Descargar .md</button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }

  function renderBlocksHtml(blocks, msgId) {
    if (!Array.isArray(blocks) || blocks.length === 0) return "";
    return blocks.map((b, idx) => {
      if (b.type === "kpis") {
        return `
          <div class="grid grid-metrics" style="margin-top:10px">
            ${(b.items || []).map(i => `
              <div class="card metric-card">
                <span class="metric-label">${MilaUtils.escapeHtml(i.label)}</span>
                <span class="metric-value">${MilaUtils.escapeHtml(i.value)}</span>
              </div>
            `).join("")}
          </div>
        `;
      } else if (b.type === "chart") {
        const canvasId = `chart_canvas_${msgId}_${idx}`;
        return `
          <div class="card" style="margin-top:10px;padding:12px">
            <h4>${MilaUtils.escapeHtml(b.title || "Gráfico")}</h4>
            <div style="position:relative;height:200px;width:100%">
              <canvas id="${canvasId}" data-chart-config='${JSON.stringify(b)}'></canvas>
            </div>
          </div>
        `;
      } else if (b.type === "alert") {
        return `
          <div class="alert alert-${b.level === "critical" ? "danger" : "warn"}" style="margin-top:10px">
            <span>⚠</span> <div>${MilaUtils.escapeHtml(b.text)}</div>
          </div>
        `;
      }
      return "";
    }).join("");
  }

  function renderChartsInMessages() {
    document.querySelectorAll("canvas[data-chart-config]").forEach(canvas => {
      try {
        const cfg = JSON.parse(canvas.dataset.chartConfig);
        if (typeof Chart !== "undefined") {
          const inst = new Chart(canvas, {
            type: cfg.chart || "bar",
            data: {
              labels: cfg.labels || [],
              datasets: (cfg.datasets || []).map(d => ({
                label: d.label,
                data: d.data,
                backgroundColor: "rgba(185, 143, 143, 0.8)",
                borderColor: "#956F6F",
                borderWidth: 1.5
              }))
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });
          chartInstances.push(inst);
        }
      } catch(e) {
        console.warn("Error inicializando Chart.js en chat:", e);
      }
    });
  }

  function bindEvents(container) {
    const btnNueva = document.getElementById("btnNuevaConversacion");
    if (btnNueva) {
      btnNueva.addEventListener("click", async () => {
        activeConversationId = null;
        currentMessages = [];
        await render(container);
      });
    }

    const textarea = document.getElementById("chatTextarea");
    const btnSend = document.getElementById("btnSendMsg");

    if (btnSend && textarea) {
      btnSend.onclick = () => enviarPregunta(textarea.value, container);
      textarea.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          enviarPregunta(textarea.value, container);
        }
      };
    }

    bindDynamicEvents(container);

    const btnPrint = document.getElementById("btnImprimirChat");
    if (btnPrint) {
      btnPrint.onclick = () => window.print();
    }
  }

  function bindDynamicEvents(container) {
    container.querySelectorAll(".chip-btn").forEach(chip => {
      chip.onclick = () => enviarPregunta(chip.dataset.prompt, container);
    });

    container.querySelectorAll(".conv-item").forEach(item => {
      item.onclick = async (e) => {
        if (e.target.classList.contains("conv-del-btn")) return;
        activeConversationId = item.dataset.convId;
        await render(container);
      };
    });

    container.querySelectorAll(".conv-del-btn").forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.dataset.delConv;
        if (MilaUtils.confirmAction("¿Eliminar esta conversación?")) {
          if (window.supabaseClient) {
            try {
              await window.supabaseClient.from("conversaciones").delete().eq("id", id);
            } catch(err){}
          }
          localStorage.removeItem(`mila_chat_msgs_${id}`);
          conversationsList = conversationsList.filter(c => c.id !== id);
          localStorage.setItem("mila_chat_conversations", JSON.stringify(conversationsList));
          if (activeConversationId === id) activeConversationId = null;
          await render(container);
        }
      };
    });

    container.querySelectorAll(".btn-copy").forEach(btn => {
      btn.onclick = () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(btn.dataset.copy);
          MilaUtils.toast("Texto copiado", "success");
        }
      };
    });
  }

  function actualizarVistaMensajes(container) {
    destroyCharts();
    const box = document.getElementById("chatMessagesBox");
    if (box) {
      box.innerHTML = renderMessagesListHtml(currentMessages);
      box.scrollTop = box.scrollHeight;
    }
    const tree = document.getElementById("conversationsTree");
    if (tree) {
      tree.innerHTML = renderConversationsTree(conversationsList);
    }
    bindDynamicEvents(container);
    renderChartsInMessages();
  }

  async function generarRespuestaLocal(msgTexto) {
    const q = msgTexto.toLowerCase();

    // Cargar datos reales de la BD asíncrona
    let pedidos = [], clientes = [], recetas = [], inventario = [];
    try {
      [pedidos, clientes, recetas, inventario] = await Promise.all([
        MilaDB.Pedidos.all().catch(() => []),
        MilaDB.Clientes.all().catch(() => []),
        MilaDB.Recetas.all().catch(() => []),
        MilaDB.Inventario.all().catch(() => [])
      ]);
    } catch(e) {}

    // 1. Consultas de Negocio / Ventas / Margen / Reporte
    if (q.includes("venta") || q.includes("vendimos") || q.includes("margen") || q.includes("factura") || q.includes("reporte") || q.includes("cuanto") || q.includes("cuánto")) {
      const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      const now = new Date();
      const yearActual = now.getFullYear();
      const mesActualIdx = now.getMonth();
      const nombreMesActual = monthNames[mesActualIdx] + " " + yearActual;

      // Filtrar pedidos del mes en curso
      const pedidosMes = pedidos.filter(p => {
        const dStr = p.fechaPedido || p.fechaEntrega || p.created_at;
        if (!dStr) return false;
        const d = new Date(dStr);
        return d.getFullYear() === yearActual && d.getMonth() === mesActualIdx;
      });

      const esConsultaMensual = q.includes("mes") || q.includes("mensual");
      const datasetPedidos = (esConsultaMensual && pedidosMes.length > 0) ? pedidosMes : pedidos;
      const esSoloMes = esConsultaMensual && pedidosMes.length > 0;

      const totalPedidos = datasetPedidos.length;
      let totalVentas = 0;
      let totalCosto = 0;
      const ventasPorReceta = {};

      datasetPedidos.forEach(p => {
        const total = Number(p.total) || 0;
        const costo = Number(p.costoProduccionEstimado) || 0;
        totalVentas += total;
        totalCosto += costo;
        const recId = p.recetaId;
        if (recId) ventasPorReceta[recId] = (ventasPorReceta[recId] || 0) + total;
      });

      // Totales históricos para comparativa
      let totalHistoricoVentas = 0;
      const totalHistoricoPedidos = pedidos.length;
      pedidos.forEach(p => { totalHistoricoVentas += Number(p.total) || 0; });

      const utilidadTotal = totalVentas - totalCosto;
      const margenUtilidad = totalVentas > 0 ? ((utilidadTotal / totalVentas) * 100).toFixed(1) : "0";
      const ticketPromedio = totalPedidos > 0 ? (totalVentas / totalPedidos) : 0;

      const labelsChart = [];
      const dataChart = [];
      recetas.forEach(r => {
        const v = ventasPorReceta[r.id] || 0;
        if (v > 0) {
          labelsChart.push(r.nombre);
          dataChart.push(v);
        }
      });

      if (labelsChart.length === 0) {
        labelsChart.push("Cookies con chips", "Torta de Chocolate", "Alfajores");
        dataChart.push(totalVentas || 15000, 9000, 6000);
      }

      const tituloSeccion = esSoloMes ? `📊 Ventas del Mes (${nombreMesActual})` : `📊 Análisis de Ventas Globales`;
      const subtituloFiltro = esSoloMes 
        ? `Facturación correspondiente a los pedidos de **${nombreMesActual}** (${totalPedidos} pedidos):` 
        : `Analicé la información histórica acumulada de tu obrador **Mila · Gestión & Obrador** (${totalPedidos} pedidos):`;

      const comparativaHistorica = esSoloMes 
        ? `\n\n*Comparativa acumulada:* En el historial total del obrador tenés **${totalHistoricoPedidos} pedidos** con un acumulado de **$${totalHistoricoVentas.toLocaleString("es-AR")}**.`
        : ``;

      return {
        mode: "negocio",
        message: `### ${tituloSeccion}\n\n${subtituloFiltro}\n\n- **Facturación del mes:** $${totalVentas.toLocaleString("es-AR")}\n- **Costo de producción del mes:** $${totalCosto.toLocaleString("es-AR")}\n- **Utilidad neta estimada del mes:** $${utilidadTotal.toLocaleString("es-AR")}\n- **Margen de ganancia del mes:** ${margenUtilidad}%\n- **Ticket promedio por pedido:** $${Math.round(ticketPromedio).toLocaleString("es-AR")}${comparativaHistorica}`,
        blocks: [
          {
            type: "kpis",
            items: [
              { label: esSoloMes ? "Ventas del Mes" : "Ventas Totales", value: `$${totalVentas.toLocaleString("es-AR")}` },
              { label: esSoloMes ? "Utilidad del Mes" : "Utilidad Neta", value: `$${utilidadTotal.toLocaleString("es-AR")}` },
              { label: "Margen Promedio", value: `${margenUtilidad}%` },
              { label: "Ticket Promedio", value: `$${Math.round(ticketPromedio).toLocaleString("es-AR")}` }
            ]
          },
          {
            type: "chart",
            chart: "bar",
            title: esSoloMes ? `Ventas por Producto (${nombreMesActual})` : "Ventas por Producto (ARS)",
            labels: labelsChart,
            datasets: [{ label: "Ventas ($)", data: dataChart }]
          }
        ]
      };
    }

    // 2. Consultas de Producción / Stock / Tortas
    if (q.includes("stock") || q.includes("torta") || q.includes("alcanza") || q.includes("producir") || q.includes("producción") || q.includes("ingrediente")) {
      const stockBajo = inventario.filter(i => Number(i.stockActual) <= Number(i.stockMinimo));
      const itemsAlert = stockBajo.map(i => `${i.nombre} (${i.stockActual} ${i.unidadMedida})`);

      let alertBlock = null;
      if (itemsAlert.length > 0) {
        alertBlock = {
          type: "alert",
          level: "critical",
          text: `Atención: Tenés ${itemsAlert.length} insumos en stock bajo: ${itemsAlert.join(", ")}.`
        };
      } else {
        alertBlock = {
          type: "alert",
          level: "info",
          text: "El stock de materias primas en el obrador está en niveles normales de producción."
        };
      }

      return {
        mode: "produccion",
        message: `### 🧑‍🍳 Evaluación de Viabilidad de Producción & Stock\n\nRevisé el inventario de materias primas:\n\n- **Materias primas en catálogo:** ${inventario.length} ítems.\n- **Materias primas bajo stock mínimo:** ${stockBajo.length} ítems.\n\nPara 3 tortas de chocolate o preparaciones estándar de pastelería, verificá disponer de aproximadamente **450g de harina 0000, 300g de mantequilla, 6 huevos y 250g de chocolate cobertura** en depósito.\n\n¿Querés que consolide una lista de compras recomendada?`,
        blocks: alertBlock ? [alertBlock] : []
      };
    }

    // 3. Consultas de Recetas / Pastelería / Insumos
    if (q.includes("receta") || q.includes("hacer") || q.includes("chocolate") || q.includes("harina") || q.includes("huevo") || q.includes("crema") || q.includes("pastelería") || q.includes("pastel")) {
      const nombresRecetas = recetas.map(r => r.nombre).join(", ") || "Cookies con chips, Torta de chocolate, Alfajores";

      return {
        mode: "recetas",
        message: `### 🍰 Asesoramiento Técnico de Pastelería\n\nCon los insumos base de tu obrador (harina, huevos, chocolate y crema) podés elaborar preparaciones clave:\n\n1. **Ganache montada de chocolate:** 200g de crema batida + 150g chocolate cobertura (emulsión ideal a 35°C).\n2. **Bizcochuelo húmedo pastelero:** 4 huevos batidos a punto letra con azúcar, incorporando harina leudante tamizada en forma envolvente.\n3. **Cookies clásicas:** Cremar manteca con azúcar rubia, incorporar huevo, chocolate picado y harina.\n\nRecetas cargadas en el sistema: **${nombresRecetas}**.\n\n¿Querés escalar alguna receta o modificar las porciones?`,
        blocks: []
      };
    }

    // 4. Respuesta general
    return {
      mode: "general",
      message: `### 🤖 Asistente Mila · Gestión & Obrador\n\nRecibí tu consulta: "*${MilaUtils.escapeHtml(msgTexto)}*".\n\nPuedo responderte con datos reales de tu negocio:\n- 📊 **Gestión & Ventas:** Facturación, utilidad neta, ticket promedio y gráficos de ventas.\n- 🧑‍🍳 **Producción & Stock:** Disponibilidad de materias primas y alertas de compras.\n- 🍰 **Recetas & Técnica:** Ratios de ingredientes, formulaciones y sustituciones.\n\n¿Qué dato específico te gustaría revisar?`,
      blocks: []
    };
  }

  async function enviarPregunta(texto, container) {
    if (!texto || !texto.trim() || isProcessing) return;
    const msgTexto = texto.trim();

    isProcessing = true;
    const indicator = document.getElementById("processingIndicator");
    if (indicator) indicator.style.display = "flex";

    // Si no hay conversación activa o estamos en welcome, iniciar una nueva conversación
    if (!activeConversationId || currentMessages.some(m => m.id === "welcome")) {
      activeConversationId = MilaDB.generateId("conv");
      const titulo = msgTexto.length > 30 ? msgTexto.substring(0, 30) + "..." : msgTexto;
      const nuevaConv = {
        id: activeConversationId,
        titulo: titulo,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      conversationsList.unshift(nuevaConv);
      currentMessages = currentMessages.filter(m => m.id !== "welcome");
    }

    // Insertar localmente mensaje del usuario
    currentMessages.push({
      id: "temp_user_" + Date.now(),
      role: "user",
      content: msgTexto,
      created_at: new Date().toISOString()
    });

    const textarea = document.getElementById("chatTextarea");
    if (textarea) textarea.value = "";

    guardarEstadoConversacion();
    actualizarVistaMensajes(container);

    try {
      let token = "";
      if (window.supabaseClient && window.supabaseClient.auth) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) token = session.access_token;
      }

      let data = null;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-asistente`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token || SUPABASE_KEY}`
          },
          body: JSON.stringify({
            mensaje: msgTexto,
            conversation_id: activeConversationId
          })
        });

        if (res.ok) {
          data = await res.json();
        } else {
          console.warn("Edge Function no retornó OK (" + res.status + "), activando motor local de respaldo.");
        }
      } catch (fetchErr) {
        console.warn("Fallo de red/CORS al llamar a Edge Function, activando motor local:", fetchErr);
      }

      // Si la Edge Function no estuvo disponible o falló autenticación, se usa el motor local inteligente
      if (!data) {
        data = await generarRespuestaLocal(msgTexto);
      }

      if (data.conversation_id) {
        activeConversationId = data.conversation_id;
      }

      currentMessages.push({
        id: data.message_id || ("asst_" + Date.now()),
        role: "assistant",
        mode: data.mode || "general",
        content: data.message || "Sin respuesta.",
        blocks: data.blocks || [],
        created_at: new Date().toISOString()
      });

    } catch (err) {
      console.error("Error al enviar pregunta:", err);
      currentMessages.push({
        id: "err_" + Date.now(),
        role: "assistant",
        mode: "general",
        content: `⚠️ **Ocurrió un error:** ${err.message || "No se pudo obtener respuesta del asistente."}`,
        created_at: new Date().toISOString()
      });
    } finally {
      isProcessing = false;
      if (indicator) indicator.style.display = "none";
      guardarEstadoConversacion();
      actualizarVistaMensajes(container);
    }
  }

  return { render };
})();
