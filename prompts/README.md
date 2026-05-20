# System Prompts — Stratos AI

Prompts de producción para los agentes de IA que pidió el equipo (Oscar / Duke).
Cada prompt está aterrizado en el esquema real de Supabase (proyecto
`glulgyhkrqpykxmujodb`, org Stratos `00000000-0000-0000-0000-000000000001`).

> Regla de oro: el LLM **nunca** inventa datos de cliente, hora de cita ni link
> de Zoom. Todo lo factual llega en el JSON de contexto que arma n8n/SQL. El
> LLM solo redacta, prioriza y conversa. Si un dato no viene, lo dice.

## Los tres agentes

| # | Agente | Canal | Modelo sugerido | Disparador | Archivo |
|---|--------|-------|-----------------|------------|---------|
| 1 | **Gerente de Ventas IA** (notificador proactivo) | Telegram (push) | Claude Haiku 4.5 + cache | `pg_cron` cada 5–15 min sobre `appointments` y `leads` | `01_gerente_ventas_ia.md` |
| 2 | **Asistente CRM por Telegram** (conversacional) | Telegram (chat) | Claude Sonnet 4.6 | Mensaje del asesor al bot | `02_asistente_crm_telegram.md` |
| 3 | **Call Center — Reactivación** (voz) | Retell AI (voz) | (motor de voz Retell) | Lead inactivo que ya tuvo primer contacto | `03_call_center_reactivacion.md` |

Agentes 1 y 2 son las **dos actividades del Gerente de Ventas** que se
describieron: (1) recordar al asesor su Zoom y pedirle reporte, alertar de
clientes olvidados; (2) poder pedir cualquier dato del CRM y registrar
clientes nuevos por Telegram. El agente 3 es el **segundo bot de call center,
específico para reactivación**, separado del que recibe al cliente la primera
vez.

## Arquitectura (cómo se conectan)

```
                         pg_cron (Supabase)
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                         │
  appointments              leads.days_inactive       scheduled_calls
  start_time ≤ 3h      hot/score alto + sin actividad   (cola Retell)
  reminder_3h_sent=f          │                         │
        │                     │                         │
        └─────────┬───────────┘                         │
                  ▼                                      ▼
        n8n: arma JSON contexto                 Retell AI (voz outbound)
                  ▼                                      │
        Agente 1 (Haiku) redacta                 Agente 3 system prompt
                  ▼                              (reactivación)
        Telegram push al asesor                         │
                  │                                      ▼
                  ▼                            ¿discovery_data existe?
        Asesor responde / pregunta             sí → agenda Zoom directo
                  ▼                            no → corre Discovery
        Agente 2 (Sonnet) conversa                     │
        lee CRM / registra lead                        ▼
        write → bot_pending_actions             appointments + discovery_data
        (confirma 2 pasos, HMAC)
```

## Contrato de datos compartido (tablas que tocan los prompts)

- **`appointments`** — `id, lead_id, start_time, end_time, timezone, meet_link,
  zoom_meeting_id, advisor_name, status, reminder_3h_sent, reminder_1h_sent,
  reminder_3m_sent`.
- **`discovery_data`** (1:1 lead) — `data jsonb` con claves reales:
  `zona, objetivo, recamaras, enganche_30, presupuesto, cita_pactada,
  duracion_segundos`.
- **`leads`** — `name, phone, whatsapp_phone_e164, voice_phone_e164, stage,
  score, hot, presupuesto, project, campaign, seguimientos, next_action,
  next_action_at, last_activity, days_inactive, asesor_id, asesor_name, notas,
  bio, friction, risk, tasks (jsonb), playbook (jsonb), action_history (jsonb),
  call_attempts, telegram_user_id, organization_id`.
- **`lead_tasks`** — `lead_id, text, done, due_at, priority, order_idx`.
- **`comunicaciones`** — `lead_id, asesor_id, tipo, resumen, transcripcion,
  ocurrio_en, duracion_segundos`.
- **`voice_call_logs`** — `lead_id, direction, duration_seconds, call_summary,
  transcript, recording_url, disconnection_reason`.
- **`scheduled_calls`** — `phone_e164, scheduled_at, status, attempted_at`.
- **`profiles`** (asesor) — `id, name, role, phone, telegram_chat_id, active,
  view_all_leads, organization_id`.
- **`bot_pending_actions`** — `token, asesor_id, telegram_chat_id, action_type,
  payload (jsonb), summary, expires_at, consumed_at`. Patrón de confirmación de
  2 pasos para toda escritura desde Telegram.
- **`bot_config`** — `callback_ttl_minutes (60)`, `pending_action_ttl_minutes
  (10)`, `hmac_secret` (firmar callbacks; rotar trimestral).

## Convenciones de los prompts

1. **Idioma:** español mexicano, tono cálido y profesional (mercado Cancún /
   Miami). Sin emojis salvo que el archivo del agente los pida.
2. **Zona horaria:** siempre mostrar hora local del lead (`appointments.timezone`,
   default `America/Cancun`). Nunca UTC al usuario.
3. **Dinero:** `presupuesto` (bigint) en USD/MXN según `leads.budget`; formatear
   con separador de miles.
4. **Identidad:** el Gerente IA se presenta como "Gerente de Ventas Stratos".
   El de reactivación retoma el hilo previo, no se presenta como si fuera la
   primera vez.

## Preguntas abiertas a confirmar con Oscar (antes de pasar a producción)

Ver el bloque "Pendientes" al final de cada archivo. Resumen:

- Umbral exacto de "cliente olvidado" (¿`days_inactive ≥ 3`? ¿depende de
  `stage`/`hot`?).
- A quién escala el Gerente IA cuando el asesor ignora el recordatorio.
- Si el reporte que pide al asesor se guarda en `comunicaciones` o en
  `lead_tasks`/`action_history`.
- Política de horario para llamadas de reactivación (no llamar de noche).
