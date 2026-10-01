-- MIGRATION 0005: TABLAS DE IA, HISTORIAL Y AUDITORIA
-- Proyecto: Mila · Gestión & Obrador

-- 1. TABLAS DE CHAT E HISTORIAL
CREATE TABLE IF NOT EXISTS conversaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL DEFAULT 'Nueva conversación',
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mensajes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversacion_id UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    blocks JSONB,
    mode TEXT CHECK (mode IN ('recetas', 'produccion', 'negocio', 'general')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversacion_estado (
    conversacion_id UUID PRIMARY KEY REFERENCES conversaciones(id) ON DELETE CASCADE,
    entidades JSONB NOT NULL DEFAULT '{}'::jsonb,
    resumen TEXT DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AUDITORIA Y CONTROL DE COSTOS
CREATE TABLE IF NOT EXISTS ia_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversacion_id UUID REFERENCES conversaciones(id) ON DELETE SET NULL,
    tool_name TEXT NOT NULL,
    args JSONB,
    filas INT,
    duracion_ms INT,
    ok BOOLEAN NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia_uso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tokens_in INT NOT NULL,
    tokens_out INT NOT NULL,
    modelo TEXT NOT NULL,
    costo_estimado NUMERIC(10,6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDICES
CREATE INDEX IF NOT EXISTS idx_conversaciones_user ON conversaciones(user_id, negocio_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON mensajes(conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ia_auditoria_negocio ON ia_auditoria(negocio_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ia_uso_user ON ia_uso(user_id, created_at);

-- RLS
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversacion_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso conversaciones usuario" ON conversaciones;
CREATE POLICY "Acceso conversaciones usuario" ON conversaciones
    FOR ALL USING (user_id = auth.uid() AND user_is_member_of(negocio_id));

DROP POLICY IF EXISTS "Acceso mensajes conversacion" ON mensajes;
CREATE POLICY "Acceso mensajes conversacion" ON mensajes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM conversaciones c
            WHERE c.id = mensajes.conversacion_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Acceso estado conversacion" ON conversacion_estado;
CREATE POLICY "Acceso estado conversacion" ON conversacion_estado
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM conversaciones c
            WHERE c.id = conversacion_estado.conversacion_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Acceso ia_auditoria usuario" ON ia_auditoria;
CREATE POLICY "Acceso ia_auditoria usuario" ON ia_auditoria
    FOR SELECT USING (user_is_member_of(negocio_id));

DROP POLICY IF EXISTS "Acceso ia_uso usuario" ON ia_uso;
CREATE POLICY "Acceso ia_uso usuario" ON ia_uso
    FOR SELECT USING (user_is_member_of(negocio_id));
