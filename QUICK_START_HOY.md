# Cómo empezar HOY MISMO a meter leads de WhatsApp al CRM

> Diseñado para destrabar ventas hoy mientras Meta termina la verificación.
> Funciona con cualquiera de los canales que ya tienen: **paste manual**, **Telegram bot**, **Twilio**, **Chatwoot**, **Evolution API**.

## Qué ya está desplegado y vivo en producción

✅ Tabla `public.whatsapp_inbox` en Supabase (audit trail crudo de cada mensaje inbound).
✅ RPC `public.ingest_inbound_lead(payload jsonb)` — dedupea por teléfono o correo, crea/actualiza el lead, escribe en `comunicaciones`, registra en `audit_log`.
✅ Trigger `trg_leads_audit_changes` que registra cualquier cambio de `asesor_id` / `stage` / `deleted_at` en `audit_log` con el `actor_id` del JWT. **Anti-robo blando ya activo.**
✅ Edge Function **`quick-lead-ingest`** publicada y activa en
   `https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest`.
   Recibe POST JSON, llama a Anthropic Haiku 4.5 para extraer datos del mensaje, llama la RPC.

## Secrets a configurar en Supabase (Dashboard → Edge Functions → Secrets)

| Secret | Valor | Notas |
|---|---|---|
| `ANTHROPIC_API_KEY` | tu clave Anthropic | Sin esta, la Edge Function igual funciona pero sin extracción LLM (solo guarda crudo). |
| `QUICK_INGEST_SECRET` | un secreto aleatorio que generes | Header `x-shared-secret` que el caller debe mandar. Si no lo seteas, la function no exige header. |
| `DEFAULT_COUNTRY` | `MX` | Default. |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Default. |

Las claves de Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) ya están auto-provistas por Supabase.

## Tres formas de meter leads HOY (eligen una, las tres funcionan)

### A) Paste manual desde Claude Code (cero infraestructura)

El asesor (o tú) toma el primer mensaje del cliente que llegó a su WhatsApp corporativo, lo pega:

```bash
export QUICK_INGEST_URL='https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest'
export QUICK_INGEST_SECRET='<el secreto que pongas en Supabase>'
export OPERATOR_NAME='Oscar Galvez'

python3 .claude/skills/duke-lead-ingest/scripts/paste_message.py \
    --asesor-id cc1030f0-d738-49fe-972d-7acbb6f48cea \
    --sender-phone '+529981112233' \
    --sender-name 'Cliente WhatsApp' \
    --message 'Hola, vi su anuncio del depa en Bay View Grand'
```

Si omites `--message`, se abre tu `$EDITOR` para pegar el texto completo.

Respuesta:
```json
{
  "ok": true,
  "result": { "lead_id": "...", "is_new": true, "asesor_name": "Araceli Oneto" },
  "extracted": { "name": "...", "project_interest": "Bay View Grand", "intent": "inversion", "notes": "..." }
}
```

Listo. El lead aparece en el CRM con la conversación inicial registrada en `comunicaciones` y auditoría completa.

### B) Bot Telegram del asesor (lo más cómodo para ellos)

Reciclar el workflow n8n `Stratos AI — Telegram CRM Bot v4 (asesor)` (ya activo). Agregar un comando `/lead` o un trigger por mensaje reenviado:

1. El asesor reenvía el mensaje del WhatsApp del cliente al bot Telegram.
2. El bot extrae `sender_name` (del header del forward) y pide `--sender-phone` si no vino en el reenvío.
3. Llama a la Edge Function con POST:

```
POST https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest
Headers: { "x-shared-secret": "<secret>", "content-type": "application/json" }
Body: {
  "source": "telegram_forward",
  "asesor_id": "<uuid del asesor mapeado por telegram_chat_id>",
  "sender_phone": "<el numero>",
  "sender_name": "<nombre>",
  "message_text": "<el mensaje reenviado>"
}
```

Como `profiles.telegram_chat_id` ya existe, el bot puede mapear `chat_id → asesor_id` sin pedir nada al asesor.

### C) Webhook Twilio / Chatwoot / Evolution

El workflow `Twilio Whatsp` (ya activo) o `01 - INBOUND | Chatwoot Webhook -> DB -> Retell` pueden agregar un nodo HTTP Request final que llama a la Edge Function con `source=twilio` o `source=chatwoot`. Sin tocar nada más del flujo existente.

Body típico desde Twilio:
```json
{
  "source": "twilio",
  "asesor_phone": "+528991234567",
  "sender_phone": "+529981112233",
  "sender_name": "Juan",
  "message_text": "Hola, quiero info de Bay View Grand"
}
```

> **Importante:** para que el mapeo `asesor_phone → asesor_id` funcione, hay que poblar `profiles.phone` con el número corporativo de cada asesor. Hoy todos están NULL. Puedes hacerlo manualmente con un SQL una sola vez:

```sql
UPDATE public.profiles SET phone='+5219981112233' WHERE name='Alexia Santillán';
-- repetir por asesor
```

Si no quieres tocar `profiles.phone`, pasa siempre `asesor_id` explícito desde n8n.

## Cómo verificar que está funcionando

```sql
-- Últimos 10 inbound entrando hoy:
SELECT received_at, source, sender_name, sender_phone, lead_id, processed_at, processing_error
FROM public.whatsapp_inbox
ORDER BY received_at DESC LIMIT 10;

-- Leads creados hoy por la Edge Function:
SELECT name, phone, source, stage, asesor_name, created_at
FROM public.leads
WHERE source IN ('whatsapp_inbound','manual_paste','telegram_forward')
  AND created_at::date = CURRENT_DATE
ORDER BY created_at DESC;

-- Audit log de la actividad:
SELECT created_at, actor_name, action, metadata->>'action_detail' AS detail, entity_id
FROM public.audit_log
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

## Qué pasa cuando llega un duplicado

- Mismo teléfono normalizado o mismo correo → **NO crea lead nuevo**.
- Append a `leads.action_history` con un evento `whatsapp_inbound`.
- Actualiza `last_activity`, baja `days_inactive` a 0.
- Inserta nueva fila en `comunicaciones` con el mensaje.
- Audit log con `action_detail='inbound_whatsapp_followup'`.

Esto es exactamente lo que quieres: si un cliente vuelve a escribir, su asesor original no cambia, pero queda registrado el nuevo mensaje.

## Limitaciones honestas

1. **Mapeo asesor_phone → asesor_id requiere `profiles.phone` poblado.** Hoy está todo en NULL. Mientras no se pueble, hay que pasar `asesor_id` explícito desde el caller, o el lead queda sin asesor asignado.
2. **No hay round-robin automático para inbound.** El inbound viene "para el asesor que recibió el mensaje". Si pasas `asesor_id` NULL, el lead queda sin asesor y un super_admin lo asigna manualmente. Si quieres round-robin para casos donde llegue al número general, se puede agregar a la RPC.
3. **El LLM puede equivocarse al extraer.** Por eso `extracted` se guarda **además** del mensaje crudo en `whatsapp_inbox` — siempre puedes re-procesar.
4. **Sin secret en la Edge Function, está abierta.** Setea `QUICK_INGEST_SECRET` antes de exponerla seriamente.

## Siguiente paso natural

Cuando Meta libere el WABA, el workflow n8n `1. Leads_Meta` se reactiva y apunta a la **misma** Edge Function `quick-lead-ingest` con `source=meta_webhook`. Cero cambios al CRM. La capa de auditoría (Skill auditor) viene encima de `comunicaciones`, que ya se está poblando desde ahora.
