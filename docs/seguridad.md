# Políticas de Seguridad e Inmunización de Prompts — Mila

## 1. Principios No Negociables
1. **Sin credenciales de BD para la IA:** El modelo no ejecuta SQL libre ni conoce la cadena de conexión de la base de datos.
2. **Extracción de Tenant desde JWT:** `negocio_id` y `user_id` son extraídos estrictamente del header `Authorization` (JWT verificado por Supabase Auth).
3. **Aislamiento Multitenant con RLS:** Políticas Postgres habilitadas en todas las tablas (`SECURITY INVOKER`).
4. **Delimitación de Datos Inseguros:** Los resultados de tools y campos de texto introducidos por los usuarios se encapsulan en bloques pasivos de datos.
5. **Sanitización UI Client-Side:** Todo contenido renderizado pasa por `DOMPurify.sanitize()` antes de insertarse en el DOM.
