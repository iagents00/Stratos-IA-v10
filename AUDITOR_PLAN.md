# Agente Auditor de Conversaciones — Plan técnico

> **Caso:** detectar en tiempo casi real cuando un asesor intenta sacar al cliente del canal corporativo (WhatsApp personal, cierre con desarrollador directo, descuento no autorizado, bypass del CRM).
> **Por qué importa:** en mercados como Cancún/Miami el robo de clientes es estructural; la agencia invierte en campañas/oficinas/nómina y el asesor cierra por fuera. Esta es la **capa de defensa real** — el CRM solo registra, esta IA **detecta intención**.

## Veredicto: es completamente factible hoy

Tu stack ya tiene lo necesario o pre-cableado:

- **Supabase**: tabla `public.comunicaciones` ya existe vacía con columnas perfectas (`lead_id`, `asesor_id`, `tipo`, `resumen`, `transcripcion`, `ocurrio_en`, `duracion_segundos`, `metadata jsonb`, `search_vector tsvector`). Solo falta poblarla.
- **n8n**: workflows `01 - INBOUND | Chatwoot Webhook -> DB -> Retell` y `08 - HUMAN SYNC | Chatwoot Webhook -> DB` activos. `2 - OUTBOUND | Retell Callback -> DB Sync -> Chatwoot` activo para transcripciones de llamadas.
- **Chatwoot + Retell** capturando WhatsApp / llamadas.
- **Telegram bots** ya operativos en n8n (`NSG - TELEGRAM AGENT`, etc.).

**No necesitas dejar una PC prendida 24/7.** El servidor n8n + Supabase ya están en la nube — el procesamiento corre como cron de Supabase + n8n. La idea de "PC secundaria" era para un agente Computer Use; con este enfoque API-first es más confiable y mucho más barato.

## Arquitectura

```
                                                      ┌─────────────────────────────────┐
Chatwoot webhook ─┐                                   │  pg_cron (cada 5 min)           │
                  ├──► n8n Webhook ─► comunicaciones  │   ↓                             │
Retell callback ──┘     (insert raw)                  │  RPC: conversaciones con        │
                                                      │  mensajes_nuevos_no_auditados   │
                                                      │   ↓                             │
                                                      │  n8n HTTP trigger               │
                                                      │   ↓                             │
                                                      │  [pre-filtro regex keywords]    │
                                                      │   ↓ (si match O cada N min)     │
                                                      │  Claude Haiku 4.5 + cache       │
                                                      │   ↓                             │
                                                      │  JSON {score, flags, evidence}  │
                                                      │   ↓                             │
                                                      │  INSERT audit_flags             │
                                                      │   ↓                             │
                                                      │  severity ≥ alta?               │
                                                      │   ↓ sí                          │
                                                      │  Telegram → Oscar / gerente     │
                                                      └─────────────────────────────────┘

Cron diario 23:00:
   Anthropic Batch API (50% off) re-audita las últimas 24h con Sonnet 4.6 → segunda capa más estricta.
```

## Modelo LLM elegido

| Función | Modelo | Razón | Costo |
|---|---|---|---|
| Clasificador principal | **Claude Haiku 4.5** | suficiente calidad en español + JSON estructurado vía `tool_use` | $1 input / $5 output / **$0.10 cache hit** |
| Re-auditoría diaria | **Claude Sonnet 4.6 Batch** | segunda revisión con mejor razonamiento, sin urgencia | $1.50 / $7.50 (con batch 50% off) |
| Pre-filtro | regex en Postgres | gratis, baja 80% el volumen al LLM | $0 |

**Prompt caching** (Anthropic): la rúbrica completa + 20 ejemplos few-shot van en el system prompt, que se cachea por 1 hora a costo `0.1x`. Cada conversación nueva paga solo ~200 tokens "frescos". **Ahorro real ~95%** vs llamada naive.

## Rúbrica inicial (categorías de riesgo)

1. **Canal externo** — "mi WhatsApp personal", "mándame al [otro número]", "mi correo personal", "agrégame en…".
2. **Bypass CRM** — "salgamos del sistema", "no le digas a la agencia", "entre tú y yo", "te lo cierro yo directo".
3. **Bypass agencia / desarrollador directo** — "te llevo con el desarrollador", "el constructor me da más comisión", "compra directo".
4. **Descuento no autorizado** — "te bajo X%", "te lo dejo en…", "negociamos por fuera".
5. **Datos fuera de canal** — pedir INE/comprobante/depósito a cuenta personal del asesor; agendar visita sin registrar.
6. **Drift signal (no lingüístico)** — conversación activa que se "apaga" en Chatwoot durante >48h sin `stage_change` ni cierre — alto indicador de movimiento off-platform. Esta señal no usa LLM, es un cron SQL.

Cada flag puntúa 0-100. Score agregado por conversación. Severidad: `low<30`, `medium 30-60`, `high 60-85`, `critical >85`. Solo `high`+`critical` notifican Telegram inmediato; el resto entra al digest diario al gerente.

## Costo estimado mensual

Asumiendo Duke del Caribe a régimen normal:
- 100 leads activos/día × 10 mensajes/conversación = 1,000 msg/día = ~30,000/mes.
- Mensaje promedio ~150 tokens; output JSON ~80 tokens.
- Sin pre-filtro: ~$12/mes en Haiku.
- **Con pre-filtro regex que reduce a 20%:** ~$2.5/mes.
- Batch nocturno Sonnet sobre 20% más críticos: ~$3/mes.
- **Total: ~$5-15 USD/mes en tokens.** Despreciable.

(Para referencia: si escalan a 10× el volumen — toda Stratos, no solo Duke — sigue siendo <$150/mes.)

## Plazo de implementación

Total: **1-2 semanas para MVP estable**, dividido así:

| Fase | Duración | Entregable |
|---|---|---|
| **Día 1-2** | Confirmar/ajustar que workflows `01` y `08` escriben en `comunicaciones`. Crear tabla `audit_flags` + RLS. | Migración SQL aplicada, datos fluyendo. |
| **Día 2-3** | Workflow n8n `AUDITOR-CRON-5min` con Haiku 4.5 + cache + tool_use schema. Pre-filtro keyword en Postgres. | Primer flag de prueba generado. |
| **Día 4** | Notificador Telegram al gerente + digest diario. | Oscar recibe primera alerta de prueba. |
| **Día 5-7** | Calibración con conversaciones reales: ajustar umbrales, reducir falsos positivos, agregar ejemplos few-shot al cache. | Tasa de falsos positivos <10%. |
| **Día 8-10** | Drift signal (cron horario) + dashboard simple (vista Supabase). | Detección no-lingüística operativa. |
| **Día 10-14** | Re-auditoría nocturna con Sonnet 4.6 Batch + métricas mensuales por asesor. | Reporte semanal a Oscar. |

## Legalidad en México (LFPDPPP, marzo 2025)

La nueva LFPDPPP entró en vigor 21-mar-2025. Para que esto sea legal sin riesgo:

1. **Aviso de privacidad actualizado** a clientes mencionando: tratamiento con IA, transferencia internacional a Anthropic (US), retención de transcripciones.
2. **Aviso al asesor** + cláusula en contrato laboral autorizando auditoría de conversaciones en canales corporativos.
3. **Solo canales corporativos.** La Ley Federal del Trabajo prohíbe monitorear cuentas personales del empleado. Esto refuerza el punto central: la regla anti-robo es "**todas las conversaciones con clientes deben ocurrir en Chatwoot / WhatsApp Business corporativo / Retell**". Cualquier desvío a canal personal del asesor es justamente lo que el auditor detecta — no necesitamos espiar el teléfono personal, basta con detectar que el asesor *propone* salirse, en la conversación corporativa.
4. **Minimización**: retener transcripciones solo lo necesario (sugerencia: 12 meses para evidencia disciplinaria/legal, después agregado anónimo).

## Tabla nueva: `audit_flags`

```sql
CREATE TABLE public.audit_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    asesor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    comunicacion_id uuid REFERENCES comunicaciones(id) ON DELETE CASCADE,
    score smallint NOT NULL,
    severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    flags jsonb NOT NULL DEFAULT '[]',         -- ["external_channel","bypass_crm",...]
    evidence jsonb NOT NULL DEFAULT '[]',      -- [{"quote":"...","category":"..."}]
    model_used text NOT NULL,
    model_run_at timestamptz NOT NULL DEFAULT now(),
    notified_at timestamptz,
    resolved_at timestamptz,
    resolved_by uuid REFERENCES profiles(id),
    resolution text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_flags_org ON audit_flags(organization_id);
CREATE INDEX idx_audit_flags_asesor ON audit_flags(asesor_id);
CREATE INDEX idx_audit_flags_severity ON audit_flags(severity) WHERE resolved_at IS NULL;
ALTER TABLE audit_flags ENABLE ROW LEVEL SECURITY;
-- Solo super_admin de la org ve flags; los asesores NUNCA ven que están siendo auditados.
```

## Cómo el auditor evita falsos positivos

- **Doble pasada:** Haiku marca, Sonnet revalida los `high+critical` antes de notificar.
- **Ventana de conversación, no mensaje suelto:** un asesor puede mencionar "WhatsApp" en contexto inocente; lo que cuenta es la intención agregada de los últimos N mensajes.
- **Confidence threshold:** solo notifica si Haiku Y Sonnet coinciden con score > 70.
- **Whitelist por asesor con buen historial:** después de 30 días sin flag, sube umbral 10 puntos.

## Próximo paso

Si Oscar aprueba, el orden de ejecución es:

1. Aplicar migración Supabase de `audit_flags` + RLS + asignment_lock (anti-robo "duro" del plan anterior).
2. Confirmar/cablear que Chatwoot y Retell escriben en `comunicaciones`.
3. Crear workflow n8n auditor con prompt de rúbrica.
4. Una semana de calibración con conversaciones reales antes de notificar a gerente.

## Lo que sigue desconocido y hay que validar antes

- Si los workflows actuales de Chatwoot/Retell ya escriben en `comunicaciones` o en otra tabla — necesito ver sus nodos finales (no expuestos por MCP).
- Volumen real de mensajes/día de Duke del Caribe — los costos arriba son estimados.
- Si Oscar quiere que el digest mensual incluya métricas por asesor (cuántos flags por cada uno) — esto agrega componente HR.
- Política exacta de retención de transcripciones a fijar con un abogado de protección de datos en MX.
