# Arquitectura del Sistema — Mila · Gestión & Obrador

## 1. Visión General
La plataforma evoluciona de un modelo local (`LocalStorage`) a una arquitectura aislada basada en **Supabase Postgres + Row Level Security (RLS)** y una **Edge Function Deno (`chat-asistente`)** impulsada por **Anthropic Claude 3.5 con Tool Calling**.

```
[Navegador HTML/JS Vanilla]  --(JWT Bearer Token + JSON)-->  [Edge Function chat-asistente]
                                                                    │
  1. Verifica JWT, RLS e inyecta negocio_id                         │
  2. Valida cuota de Rate Limit (30 req / 10 min)                  │
  3. Invocación Anthropic Claude 3.5 (Tool Use Loop max 5)            │
  4. Ejecuta RPCs Postgres SECURITY INVOKER                         │
  5. Auditoría en ia_auditoria e ia_uso                             │
                                                                    ▼
[Navegador] ←-- { message, blocks[], mode, suggestions[] } ---------┘
```

## 2. Componentes Clave
- **Frontend:** JS Vanilla, CSS Vanilla, `marked` + `DOMPurify` por CDN, Chart.js.
- **Persistencia:** `MilaDB` asíncrono con capa adaptadora camelCase <-> snake_case y fallback a LocalStorage.
- **Base de Datos:** Postgres en Supabase con RLS multitenant y RPCs para consultas estadísticas agregadas.
