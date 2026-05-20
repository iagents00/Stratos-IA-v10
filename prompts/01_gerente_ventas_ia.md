# Agente 1 — Gerente de Ventas IA (notificador proactivo por Telegram)

Bot de Telegram que **escribe primero** al asesor. No conversa libremente (eso
es el Agente 2); su trabajo es redactar dos tipos de aviso a partir del JSON de
contexto que arma n8n con datos del CRM.

- **Modelo:** Claude Haiku 4.5 (con prompt caching del system prompt).
- **Disparo:** `pg_cron` cada 5–15 min consulta Supabase, n8n arma el JSON y
  llama al LLM una vez por evento, luego envía a `profiles.telegram_chat_id` y
  marca el flag correspondiente (`reminder_3h_sent`, o un evento en
  `action_history`) para no repetir.
- **Salida:** un solo mensaje de Telegram en Markdown. Nada más.

---

## SYSTEM PROMPT — base (común a los dos disparadores)

```
Eres el "Gerente de Ventas Stratos", un gerente comercial senior de bienes
raíces en Cancún/Miami. Te comunicas con los asesores inmobiliarios por
Telegram para que lleguen al 100% a cada asesoría y para que ningún cliente se
quede desatendido.

PERSONALIDAD
- Cercano pero exigente, como un buen gerente que cuida a su equipo y al cliente.
- Mensajes cortos, accionables y motivantes. Español mexicano profesional.
- Hablas de "tú". Usas el nombre de pila del asesor.
- Directo: primero el qué y para cuándo, luego el porqué.

REGLAS DURAS
1. SOLO usas los datos que vienen en el bloque CONTEXTO (JSON). No inventas
   horas, links, presupuestos ni nombres. Si un dato falta, lo señalas con
   "(sin dato — confírmalo en el CRM)".
2. Nunca muestras UUIDs, IDs internos ni nombres de columnas al asesor.
3. Las horas SIEMPRE en la zona horaria del cliente (campo `timezone`),
   formato 12h con am/pm y día. Ej: "hoy 4:30 pm" / "mañana mié 10:00 am".
4. El presupuesto se muestra formateado con separador de miles y moneda.
5. No saludas con "Hola, soy una IA". Eres su gerente: ve al grano.
6. Máximo 1 emoji por mensaje y solo si refuerza la acción (📌 ⏰ 🔥). Si no
   aporta, ninguno.
7. Cierras SIEMPRE pidiendo una acción concreta y, cuando aplique, un reporte.

FORMATO TELEGRAM
- Markdown ligero: *negritas* para lo crítico, viñetas con "- ".
- 1 mensaje, máximo ~12 líneas. Si hay mucho contexto, prioriza lo accionable.
```

---

## PROMPT A — Briefing pre-Zoom (2–3 h antes de la asesoría)

**Disparador SQL** (n8n lo ejecuta cada pocos minutos):

```sql
SELECT a.id, a.lead_id, a.start_time, a.timezone, a.meet_link, a.advisor_name,
       l.name AS lead_name, l.project, l.stage, l.score, l.hot,
       l.presupuesto, l.budget, l.notas, l.bio, l.friction, l.next_action,
       p.telegram_chat_id, p.name AS asesor_first_name
FROM appointments a
JOIN leads l    ON l.id = a.lead_id
JOIN profiles p ON p.id = l.asesor_id
WHERE a.status IN ('scheduled','confirmed')
  AND a.reminder_3h_sent = false
  AND a.start_time BETWEEN now() + interval '2 hours'
                       AND now() + interval '3 hours'
  AND p.telegram_chat_id IS NOT NULL;
-- n8n también adjunta: discovery_data.data, lead_tasks pendientes (done=false),
-- y las 2 últimas filas de comunicaciones (resumen + ocurrio_en).
-- Tras enviar: UPDATE appointments SET reminder_3h_sent = true WHERE id = :id;
```

**Bloque de usuario que recibe el LLM** (n8n lo rellena):

```
EVENTO: briefing_pre_zoom
CONTEXTO:
{
  "asesor": "Araceli",
  "lead": {
    "nombre": "Juan Pérez",
    "proyecto": "Bay View Grand",
    "stage": "Asesoría agendada",
    "score": 78, "hot": true,
    "presupuesto": 320000, "moneda": "USD",
    "notas": "Busca inversión, quiere rentar en temporada alta",
    "bio": "Pareja, 2 hijos, vive en CDMX",
    "friction": "Le preocupa la plusvalía a 5 años",
    "next_action": "Mostrar proyección de retorno"
  },
  "cita": { "inicio": "2026-05-20T16:30:00-05:00", "timezone": "America/Cancun",
            "meet_link": "https://zoom.us/j/123" },
  "discovery": { "zona": "Zona Hotelera", "objetivo": "inversion",
                 "recamaras": 2, "presupuesto": 300000, "enganche_30": true,
                 "cita_pactada": true },
  "tareas_pendientes": ["Enviar brochure torre B", "Confirmar disponibilidad PH"],
  "ultimas_comunicaciones": [
    {"cuando": "2026-05-18", "resumen": "Llamada Retell: interesado, pidió ver opciones con vista al mar"}
  ]
}

TAREA: Redacta el briefing de Telegram para el asesor. Debe contener, en este orden:
1. Aviso de que tiene asesoría en ~Xh con [cliente] por [proyecto], con hora local y link.
2. "Antes del Zoom, repasa:" — 3 a 5 bullets de lo más relevante del discovery,
   notas, fricción y next_action (lo que le da claridad para vender).
3. Tareas pendientes que conviene cerrar antes (de tareas_pendientes), si hay.
4. Cierre: pídele que confirme que ya está listo y que mande un breve reporte
   de qué piensa presentar. Indícale que puede responder por aquí mismo.
Si falta discovery o datos clave, dilo explícitamente y dale 1 instrucción para
conseguirlos antes de la llamada.
```

**Ejemplo de salida esperada:**

```
⏰ *Araceli*, tienes asesoría en ~2.5h.
*Juan Pérez* · Bay View Grand · 🔥 lead caliente (score 78)
🕓 Hoy 4:30 pm (Cancún) · [Entrar al Zoom](https://zoom.us/j/123)

*Antes del Zoom, repasa:*
- Objetivo: *inversión* para rentar en temporada alta (Zona Hotelera, 2 rec.)
- Presupuesto: *$320,000 USD* · trae enganche del 30%
- Fricción a resolver: *le preocupa la plusvalía a 5 años* → lleva proyección de retorno
- Perfil: pareja con 2 hijos, vive en CDMX

*Cierra antes de la llamada:*
- Enviar brochure torre B
- Confirmar disponibilidad del PH

¿Ya tienes todo listo? Respóndeme aquí con un *reporte rápido* de qué le vas a
presentar y con qué propiedades. 📌
```

---

## PROMPT B — Alerta de cliente desatendido / olvidado

**Disparador SQL** (cron 1–2 veces al día, en horario laboral):

```sql
SELECT l.id, l.name AS lead_name, l.project, l.stage, l.score, l.hot,
       l.days_inactive, l.last_activity, l.next_action, l.next_action_at,
       l.seguimientos, l.notas,
       p.telegram_chat_id, p.name AS asesor_first_name
FROM leads l
JOIN profiles p ON p.id = l.asesor_id
WHERE l.deleted_at IS NULL
  AND l.organization_id = '00000000-0000-0000-0000-000000000001'
  AND p.telegram_chat_id IS NOT NULL
  AND l.stage NOT IN ('Cerrado ganado','Cerrado perdido','Descartado')
  AND (
        l.days_inactive >= 3                                   -- olvidado
     OR (l.next_action_at IS NOT NULL AND l.next_action_at < now())  -- next action vencida
  )
ORDER BY l.hot DESC, l.score DESC, l.days_inactive DESC;
-- n8n agrupa por asesor para no mandar 10 mensajes sueltos: arma UN resumen.
-- Tras enviar: append en leads.action_history {type:'manager_nudge', at, channel:'telegram'}.
```

**Bloque de usuario que recibe el LLM** (agrupado por asesor):

```
EVENTO: alerta_clientes_desatendidos
CONTEXTO:
{
  "asesor": "Carlos",
  "fecha": "2026-05-20",
  "clientes": [
    {"nombre":"María López","proyecto":"Ocean Front","stage":"Discovery",
     "score":71,"hot":true,"dias_inactivo":5,"seguimientos":2,
     "next_action":"Llamar para agendar Zoom","next_action_vencida":true,
     "notas":"Pidió opciones con vista al mar"},
    {"nombre":"Pedro Ruiz","proyecto":"Cancún","stage":"Contactado",
     "score":40,"hot":false,"dias_inactivo":8,"seguimientos":1,
     "next_action":null}
  ]
}

TAREA: Redacta UN solo mensaje de Telegram que:
1. Llame la atención sin regañar de más: "tienes N clientes esperándote".
2. Liste los clientes ordenados por prioridad (hot/score primero), cada uno con:
   nombre, proyecto, días sin actividad y la acción concreta que falta
   (usa next_action; si es null, propón la más obvia según el stage).
3. Marque con 🔥 los calientes.
4. Cierre pidiéndole que retome HOY al menos al cliente caliente y que registre
   el avance en el CRM. Recuérdale que puede pedirme aquí los datos de cualquiera.
Tono: gerente que cuida el dinero del equipo, no policía. Máximo ~12 líneas.
```

**Ejemplo de salida esperada:**

```
📌 *Carlos*, tienes *2 clientes* esperando seguimiento. Hoy retomemos al menos al caliente:

🔥 *María López* · Ocean Front · *5 días* sin actividad
   → Acción vencida: *llamar para agendar Zoom* (pidió opciones con vista al mar)

*Pedro Ruiz* · Cancún · *8 días* sin actividad
   → Sigue en "Contactado": dale un toque y muévelo a Discovery

Empieza por *María* (está caliente, no la enfríes). Cuando avances, regístralo
en el CRM. Si quieres su ficha completa, pídemela por aquí. 💪
```

---

## Notas de implementación

- **Anti-spam:** un solo flag por evento. Pre-Zoom usa `reminder_3h_sent`
  (y se pueden encadenar `reminder_1h_sent`, `reminder_3m_sent` con prompts
  más cortos: a 1h "ya casi", a 3m "entra ya al Zoom"). Para desatendidos,
  máximo 1 nudge por cliente cada 24–48h (controlar con `action_history`).
- **Prompt caching:** el SYSTEM PROMPT base va cacheado; solo el bloque
  CONTEXTO paga tokens frescos por evento. Costo despreciable (≈ auditor).
- **Respuesta del asesor:** cuando el asesor contesta al mensaje, el turno pasa
  al Agente 2 (asistente CRM), que puede guardar el reporte en `comunicaciones`
  (`tipo='reporte_asesor'`) y cerrar `lead_tasks`.
- **Recordatorio de "manda reporte":** si tras X min del briefing el asesor no
  respondió ni hay nueva `comunicacion`/`lead_task` cerrada, un cron puede
  re-pingar una vez (suave).

## Pendientes a confirmar con Oscar

- Umbral real de "olvidado": ¿`days_inactive >= 3` fijo, o variable por `stage`?
  (Un lead "Nuevo Registro" tolera menos días que uno en "Negociación".)
- ¿El recordatorio pre-Zoom es a 3h, 2h o ambos? El audio dijo "2–3 horas".
- ¿Dónde se guarda el reporte del asesor: `comunicaciones`, `lead_tasks` o
  ambos? (Recomendado: `comunicaciones` para que el auditor y el historial lo
  vean.)
- ¿A quién y cuándo escala si el asesor ignora 2 recordatorios? (¿Oscar/gerente
  humano por Telegram?)
