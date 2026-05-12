---
name: duke-lead-ingest
description: Ingestar leads de campañas Meta (Facebook/Instagram Lead Ads) descargados como CSV del Leads Center y cargarlos al CRM Stratos AI en Supabase, con normalización, deduplicación, asignación round-robin de asesor y registro en audit_log. Usar cuando el operador diga "procesa los leads nuevos de Duke", "importa el CSV de Meta", "sube los leads de Bay View Grand al CRM", o pegue un archivo CSV con columnas tipo full_name/phone_number/email de Meta.
---

# Duke Lead Ingest

Procedimiento para mover leads de **Meta Lead Ads (Facebook/Instagram)** al **CRM Stratos AI (Supabase)** mientras la verificación de WhatsApp Business sigue pendiente. La Skill cubre la ruta **manual-asistida**: el operador descarga el CSV del Leads Center y la IA hace todo lo deterministico (normalizar, deduplicar, asignar, insertar, auditar).

Cuando Meta apruebe el permiso `leads_retrieval`, esta misma lógica se traslada al workflow n8n `1. Leads_Meta` para que sea webhook automático. **Mientras tanto, esta Skill destraba ventas hoy.**

## Cuándo invocarla

- "Procesa los leads nuevos de Duke / Bay View Grand / Ocean Front."
- "Importa este CSV de Meta al CRM."
- "Sube los leads de la última campaña."
- El operador pega o referencia un archivo `.csv` con columnas típicas de Meta Leads Center (`full_name`, `email`, `phone_number`, `created_time`, `ad_id`, `campaign_name`, ...).

## Flujo end-to-end

1. **Recibir el CSV.** Lo más común: archivo descargado desde Meta Business Suite → Leads Center → Exportar. El operador puede pegarlo o dar ruta.
2. **Identificar campaña y proyecto.** Mapear `campaign_name` del CSV a `campaigns.id` y `projects.id` usando `references/mapping.md`. Si no hay match, **preguntar al operador antes de continuar** — nunca inventar.
3. **Normalizar.**
   - Teléfono → E.164 (`whatsapp_phone_e164` y `phone_normalized`). Usar `scripts/ingest_leads.py` (módulo `phonenumbers`).
   - Email → lowercase + trim.
   - Nombre → title case, trim.
4. **Deduplicar.** Antes de insertar, hacer SELECT en `leads` filtrando por `organization_id` + (`phone_normalized` OR `email`). Si el lead ya existe:
   - Anotar evento `lead_reentry` en `action_history` (jsonb) — NO crear duplicado.
   - Si el `asesor_id` actual está activo, mantenerlo. Si no, reasignar.
5. **Asignar asesor (round-robin).** Solo entre `profiles.role='asesor' AND active=true AND organization_id=org`. Persistir asignación en `leads.asesor_id` + `leads.asesor_name` + fila en `lead_assignments` (`from_asesor_id=NULL`, `to_asesor_id=<elegido>`, `reason='auto_round_robin_csv_ingest'`).
6. **Insertar.** Campos mínimos por lead:
   - `organization_id` = `00000000-0000-0000-0000-000000000001` (Stratos Capital Group).
   - `name`, `email`, `phone`, `phone_normalized`, `whatsapp_phone_e164`.
   - `source` = `'meta_lead_ads_csv'`.
   - `campaign_id`, `project_id`, `campaign` (texto), `project` (texto).
   - `stage` = `'Nuevo Registro'`, `score` = 50, `is_new` = true, `hot` = false.
   - `fecha_ingreso` = `created_time` del CSV.
   - `asesor_id`, `asesor_name`.
   - `metadata` interna en `action_history` con `ad_id`, `adset_id`, `form_id` que vinieron del CSV.
7. **Auditar.** Insertar fila en `audit_log` por cada lead nuevo: `entity_type='lead'`, `action='create'`, `actor_name='Skill duke-lead-ingest'`, `metadata={"batch_id": ..., "csv_file": ..., "operator": ...}`. Para reentries: `action='reentry_ignored'`.
8. **Reportar al operador.** Resumen:
   - Total leads en CSV.
   - Insertados nuevos.
   - Reentries detectados (deduplicación).
   - Distribución por asesor.
   - Cualquier fila rechazada (con motivo).

## Reglas duras (no negociables)

- **Nunca** correr el script con credenciales fuera de `.env` local del operador. La Skill exige `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en variables de entorno; si no están, abortar y pedirlas.
- **Nunca** insertar leads con `organization_id` que no sea el de Stratos Capital Group salvo que el operador lo indique explícitamente (futuro: otros clientes).
- **Nunca** sobrescribir un `asesor_id` ya asignado a un lead existente sin pasar por `lead_assignments` con `reason` clara.
- **Nunca** insertar sin telefono O email. Sin contacto no es un lead válido — reportar y descartar la fila.
- Si Meta envía teléfono sin código de país, **preguntar el país por defecto** al operador antes de normalizar (default sugerido: MX `+52`).

## Cómo ejecutar el script

El operador (en Claude Code local) corre algo como:

```bash
export SUPABASE_URL='https://glulgyhkrqpykxmujodb.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<service_role_key>'
export OPERATOR_NAME='Oscar Gálvez'

python3 .claude/skills/duke-lead-ingest/scripts/ingest_leads.py \
    --csv ~/Downloads/duke_leads_2026-05-12.csv \
    --campaign-id <uuid> \
    --project-id <uuid> \
    --default-country MX \
    --dry-run        # primera vez SIEMPRE dry-run
```

Confirmar el reporte. Si todo OK, repetir sin `--dry-run`.

## Aprendizaje a partir de las primeras corridas manuales

Las primeras 2-3 corridas reales se guardan en `examples/` con:

- El CSV original (anonimizado si se va a commitear).
- El reporte que generó el script.
- Notas del operador con qué edge cases aparecieron (campaign_name nuevo, teléfono extraño, lead pre-existente, etc.).

Cada vez que aparezca un edge case nuevo, actualizar este SKILL.md o `references/mapping.md` para que la próxima corrida lo cubra sin intervención.

## Cuando Meta apruebe `leads_retrieval`

Esta Skill pasa a ser solo el **plan B / disaster recovery**. El path principal será:

```
Meta webhook leadgen ──► n8n "1. Leads_Meta" (workflowId SCnfVJZ4LJeYU28V) ──► Supabase leads
```

La lógica de `scripts/ingest_leads.py` se replica en nodos n8n (HTTP Request + Postgres + Code node). La Skill queda como referencia documental y para casos sin webhook (otros clientes que no tengan la app de Meta aún configurada).

## Referencias

- `references/mapping.md` — mapeo CSV columns ↔ leads columns, campaign IDs Duke, project IDs Duke.
- `references/advisors_roundrobin.md` — lista actual de asesores elegibles.
- `templates/primer_mensaje.md` — plantilla de primer contacto (uso del asesor, no automático).
- `scripts/ingest_leads.py` — script de ingest.
