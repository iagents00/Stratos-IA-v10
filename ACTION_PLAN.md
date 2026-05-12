# Plan de acción — Transferencia Meta → Stratos AI CRM

> Contexto: Duke del Caribe tiene la verificación de WhatsApp Business pausada por Meta (~15 días).
> No podemos parar ventas. Este plan destraba el flujo HOY y prepara la automatización 24/7 cuando Meta apruebe.

## Hallazgo clave

**Meta Lead Ads (formularios FB/IG) es independiente de la verificación de WhatsApp Cloud API.** Los leads siguen llegando; lo único bloqueado es el outbound automatizado por WhatsApp. Mientras tanto:

- Recibimos leads del Leads Center como CSV (manual).
- Los pasamos al CRM Stratos AI (Supabase) con la Skill `duke-lead-ingest`.
- El primer contacto sale del asesor por WhatsApp Business app (no API) o por llamada Retell (workflow `Agente llamada Duke del caribe` ya está activo).

## Patrón híbrido (Skill + n8n)

```
HOY (Meta verificación pendiente):
   Leads Center CSV ──► Claude Skill "duke-lead-ingest" ──► Supabase leads
                       (operador la invoca cada vez que descarga)

CUANDO META APRUEBE leads_retrieval:
   Meta webhook leadgen ──► n8n "1. Leads_Meta" ──► Supabase leads
                                                  └► Retell AI / WhatsApp Cloud API
```

La lógica documentada en la Skill se transcribe a n8n cuando Meta libere. La Skill queda como plan B y como base reutilizable para otros clientes.

## Fases

### Fase 0 — Higiene de datos (30 min, una vez)

- [ ] Confirmar si existe campaña explícita "Duke del Caribe" en `public.campaigns`. Si no, crearla con `meta_ad_id` / `meta_ad_pattern`.
- [ ] Confirmar mapeo de `campaign_name` (CSV de Meta) → `campaigns.id` y `projects.id` en `.claude/skills/duke-lead-ingest/references/mapping.md`.

### Fase 1 — Trabajo manual 2-3 veces (hoy / mañana)

- [ ] Descargar CSV desde Meta Business Suite → Leads Center.
- [ ] Correr `ingest_leads.py --dry-run` primero, revisar reporte.
- [ ] Confirmar que campaign_id y project_id elegidos son correctos.
- [ ] Correr sin `--dry-run`. Verificar en Supabase que los leads aparecen con `asesor_id` asignado.
- [ ] Guardar CSV + reporte + notas en `.claude/skills/duke-lead-ingest/examples/<fecha>_lote_<n>/`.
- [ ] Repetir 2-3 veces. Anotar todos los edge cases (teléfonos con formato raro, duplicados, campaign_name nuevo).

### Fase 2 — Endurecer la Skill (día 2-3)

- [ ] Actualizar `SKILL.md` y `references/mapping.md` con los edge cases encontrados.
- [ ] Confirmar reglas de scoring inicial / asignación / first message con Oscar.
- [ ] Probar la Skill como segundo operador: dar un CSV a otra persona y que ejecute todo desde Claude Code sin intervención técnica.

### Fase 3 — Anti-robo de clientes (paralelo, día 1-3)

- [ ] Trigger `BEFORE UPDATE` en `leads` que bloquee cambios de `asesor_id` salvo `super_admin` (o `view_all_leads=true`).
- [ ] Habilitar extensión `pgaudit` en Supabase para SELECT/UPDATE/DELETE sobre `leads` y `audit_log`.
- [ ] Revocar export directo del rol `authenticated` sobre Storage; exports solo vía Edge Function que registre en `audit_log`.
- [ ] Confirmar RLS de `leads`, `audit_log`, `lead_assignments` por `organization_id`.

### Fase 4 — Reactivar webhook automático (día 10-15, al desbloquear Meta)

- [ ] Reactivar workflow n8n `1. Leads_Meta` (`SCnfVJZ4LJeYU28V`).
- [ ] Apuntar a la misma tabla `leads` con misma lógica de la Skill (idempotente por `whatsapp_wa_id` / `phone_normalized`).
- [ ] Habilitar Cloud API saliente al número verificado.
- [ ] Dejar la Skill como plan B / disaster recovery.

## Reutilización para otros clientes

- Copiar `.claude/skills/duke-lead-ingest/` a `.claude/skills/<cliente>-lead-ingest/`.
- Cambiar `organization_id` por defecto si es otra org del CRM.
- Ajustar `references/mapping.md` con campañas y proyectos del cliente.

## Limitaciones explícitas

- Una Skill no es 24/7 — requiere que un operador la invoque en Claude Code. Para 24/7 hace falta n8n (cuando Meta libere).
- El script usa `SUPABASE_SERVICE_ROLE_KEY`; debe vivir en el `.env` local del operador, **nunca** en git.
- El round-robin sesga por menor carga del día — si todos están parejos, gana orden alfabético. No es justicia perfecta, es prevención de "todo a uno".
