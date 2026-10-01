# Diseño del System Prompt de la IA — Mila

## 1. Principios de Orquestación
El System Prompt se encuentra versionado en `supabase/functions/chat-asistente/prompts/system.ts`.
Está estructurado en secciones estrictas:
1. **Identidad:** Chef pastelero técnico + Analista senior de negocios de pastelería artesanal.
2. **Modos:** Clasificación en `recetas`, `produccion`, `negocio` o `general`.
3. **Regla de Oro de Datos:** Las cifras provienen 100% de `tool_result`. La IA nunca especula ni inventa datos financieros.
4. **Cálculos:** Escalado de recetas e indicadores financieros delegados a funciones deterministas en código/SQL.
5. **Formato Rioplatense:** Uso natural de voseo ("vos", "tenés", "necesitás").
6. **Inyección Segura de Contexto:** Bloque `[ESTADO DE LA CONVERSACIÓN]` con resumen y entidades activas.
