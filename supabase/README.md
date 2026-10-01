# Despliegue de Base de Datos y Edge Function `chat-asistente` — Mila

Guía oficial para desplegar las migraciones Postgres con RLS y la Edge Function segura de IA.

## Prerrequisitos

1. Supabase CLI instalada:
   ```bash
   npm install -g supabase
   ```
2. Iniciar sesión y vincular el proyecto:
   ```bash
   supabase login
   supabase link --project-ref rvssvunhrgnbmdkwtvax
   ```

---

## 1. Aplicar Migraciones de Base de Datos (SQL + RLS + RPCs)

Aplica las 5 migraciones en orden sobre la base de datos de Supabase:

```bash
supabase db push
```

O bien ejecuta en el **SQL Editor** del Panel de Supabase los siguientes archivos en orden:
1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_functions_stats.sql`
4. `supabase/migrations/0004_functions_recipes.sql`
5. `supabase/migrations/0005_ia_tables.sql`

---

## 2. Configurar Secretos de la Edge Function

Ejecuta en la consola de Supabase CLI los siguientes secretos:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
supabase secrets set AI_MODEL_MAIN=claude-3-5-haiku-20241022
supabase secrets set ALLOWED_ORIGINS=*
```

---

## 3. Desplegar la Edge Function (con Verificación de JWT Activada)

Despliega la función `chat-asistente` sin la bandera `--no-verify-jwt` para requerir autenticación segura Bearer JWT en cada solicitud:

```bash
supabase functions deploy chat-asistente
```

---

## 4. Verificación y Prueba

Una vez desplegada, la Edge Function responderá a través del ChatBox en la vista `#asistente` de la aplicación Mila. Cada invocación ejecutará las RPCs seguras bajo RLS y registrará auditoría en `ia_auditoria` e `ia_uso`.
