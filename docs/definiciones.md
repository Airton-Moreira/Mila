# Definiciones de Negocio — Mila · Gestión & Obrador

> **Versión:** 1.0.0
> **Ámbito:** Motores de reporte, analítica de datos y RPCs de IA.

---

## 1. Métrica de Ventas y Facturación
- **Venta / Facturación Real:** Suma de los importes (`total`) de los pedidos en estado `Entregado`, considerando la fecha efectiva `fecha_entregado` (con fallback a `fecha_entrega`).
- **Pipeline / Ventas Pendientes:** Pedidos en estados `Pendiente`, `Confirmado`, `En Preparacion` o `Listo`. No computan como facturación realizada.

## 2. Utilidad y Márgenes
- **Utilidad Bruta por Pedido:** `total` − `costo_produccion` (calculado a partir del costo actualizado de las materias primas al momento de registrar el pedido o entrega).
- **Margen Bruto %:** `(Utilidad Bruta / Venta Total) × 100`.
- **Margen Neto %:** `((Utilidad Bruta − Gastos Fijos) / Venta Total) × 100`.

## 3. Gasto en Insumos vs. Consumo
- **Gasto en Ingredientes:** Suma de los costos totales registrados en la tabla `compras` durante el período consultado.
- **Costo de Ingredientes Consumidos:** Suma de los movimientos de stock tipo `salida` multiplicados por el costo unitario de cada insumo.

## 4. Períodos Operativos
- **Semana:** Lunes a Domingo en horario local `America/Argentina/Cordoba`.
- **Mes:** Mes calendario (ej. del 1 al 30/31 del mes).
- **Comparación:** Período inmediatamente anterior de igual duración.
