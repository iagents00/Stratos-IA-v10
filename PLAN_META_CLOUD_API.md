# Plan Meta Cloud API → CRM automático (número +52 984 877 9295)

> Objetivo: cuando un cliente le escriba al WhatsApp +52 984 877 9295 (cualquier ad de Duke del Caribe), el mensaje aterrice automáticamente en el CRM Stratos AI como un lead asignado a Gael, con nombre + teléfono garantizados.

## Datos confirmados desde tus screenshots

| Dato | Valor |
|---|---|
| **Portafolio comercial** | El Duke del Caribe |
| **Página de Facebook** | El duke del Caribe (verificada, 454.7K seguidores) |
| **Instagram** | @eldukedelcaribe (189.8K) |
| **WABA (WhatsApp Business Account)** | Duke del Caribe Real Estate |
| **WABA ID** | `263671803501919` |
| **Número** | **+52 1 984 877 9295** (México) |
| **Estado del número** | "Sin conexión" — **OJO: no es "verificación pendiente". Significa que el número está activo en Cloud API pero NINGUNA app/cliente API está conectada al webhook actualmente.** |
| **Calidad** | Alta |
| **System user con acceso** | **wsp ddc 1.0** — Identificador `61582745786736` |
| **Asesor destino** | Gael G — `941ad724-dc5d-46a5-8487-fda87a297b31` — phone ya seteado a +529848779295 |
| **Endpoint listo** | `https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest` |

## Reglas duras ya aplicadas en el CRM

- RPC `ingest_inbound_lead` **rechaza** cualquier mensaje sin **nombre Y teléfono válido**. Los rechazos quedan en `whatsapp_inbox.processing_error` para auditoría, no contaminan `leads`.
- Meta Cloud API webhook **siempre** envía `from` (teléfono E.164) y `contacts[0].profile.name` (nombre WhatsApp del cliente). Por lo tanto **el 100% de los mensajes que pasen por aquí van a tener nombre+teléfono garantizados**.

---

## Plan paso a paso — qué hacer en Meta

### 0. Pre-requisitos en Supabase (1 vez, ~3 minutos)

Dashboard → Project → Edge Functions → `quick-lead-ingest`:

1. **Apagar Enforce JWT.** Settings → toggle "Verify JWT" → **OFF**. Esto permite que Meta llame al webhook sin token Supabase. (La autenticación viene por `META_VERIFY_TOKEN` que setean abajo).

Project Settings → Edge Functions → Secrets, agregar:

```
META_VERIFY_TOKEN       = <generar string aleatorio largo, p. ej. abrir https://1password.com/password-generator/ y copiar>
META_GRAPH_TOKEN        = <System User Access Token de wsp ddc 1.0, lo generamos en paso 2>
META_GRAPH_VERSION      = v21.0
ANTHROPIC_API_KEY       = <tu clave Anthropic, para extraccion LLM>
DEFAULT_COUNTRY         = MX
QUICK_INGEST_SECRET     = <string aleatorio para callers internos (Telegram bot, paste manual)>
```

Guardá `META_VERIFY_TOKEN` y `QUICK_INGEST_SECRET` en 1Password — los necesitás abajo.

---

### 1. Crear App en Meta for Developers (si aún no existe) — 5 min

URL: <https://developers.facebook.com/apps/>

1. Click **"Create App"**.
2. **App type**: "Business".
3. **App name**: "Stratos AI - Duke del Caribe Ingest".
4. **Business Account**: seleccionar **El Duke del Caribe** (el portafolio comercial que viste en screenshot 2).
5. Crear.
6. En la app, panel izquierdo → **Products** → **WhatsApp** → **Set up**.
7. En **WhatsApp → API Setup**, vincular la WABA **Duke del Caribe Real Estate** (`263671803501919`).

> **Si ya existe la app**, salta este paso y solo abrila.

---

### 2. Generar System User Access Token permanente — 3 min

URL: <https://business.facebook.com/settings/system-users> (Business Settings → Usuarios del sistema)

1. Click en **wsp ddc 1.0** (`61582745786736`) — el que viste en screenshot 3.
2. Click **"Generate new token"** (esquina superior derecha).
3. **App**: la app del paso 1.
4. **Token expiration**: **Never**. ← Importante, sin esto vence en 60 días.
5. **Permissions** (marcar todas):
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `leads_retrieval` ← para cuando publiques la campaña "Stratos Ai CRM - BVG" con Lead Form
6. Generar. **Copia el token completo inmediatamente** (Meta solo lo muestra 1 vez).
7. Pega ese token en Supabase → Secret `META_GRAPH_TOKEN`.

---

### 3. Configurar Webhook en la app — 4 min

URL: developers.facebook.com → tu app → **WhatsApp → Configuration**.

En la sección **Webhook**:

1. Click **"Edit"** o **"Configure webhooks"**.
2. **Callback URL**:
   ```
   https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest
   ```
3. **Verify token**: pega exactamente lo que pusiste en Supabase `META_VERIFY_TOKEN`.
4. Click **"Verify and Save"**. Meta hace un GET con `hub.challenge`; la Edge Function responde con el challenge si los tokens coinciden. Si falla, revisar que el toggle "Verify JWT" esté en OFF en Supabase y que el token sea exactamente el mismo.
5. En **Webhook fields**, suscribir:
   - ✅ `messages` ← inbound WhatsApp del cliente
   - ✅ `message_template_status_update` (opcional, para diagnóstico)
   - ✅ `account_review_update` (opcional)

---

### 4. Suscribir la WABA específica al webhook — 1 min

Sin esto, aunque el webhook esté configurado, Meta no entrega los mensajes del número.

Aún en **WhatsApp → API Setup** de la app:

1. Sección **"From"** o **"Phone numbers"** → confirmá que `+52 1 984 877 9295` aparece y dice "WhatsApp Business Account" → Duke del Caribe Real Estate.
2. Más abajo, **"Subscribed apps"** de la WABA → asegurate que la app del paso 1 esté **suscrita** (botón "Subscribe").

> Alternativamente con `curl` desde tu computadora (más rápido si ya tenés el token):
> ```bash
> curl -X POST \
>   "https://graph.facebook.com/v21.0/263671803501919/subscribed_apps" \
>   -H "Authorization: Bearer $META_GRAPH_TOKEN"
> ```

---

### 5. Suscribir Lead Ads webhook (para cuando publiques el Lead Form) — 2 min

Esto es independiente de WhatsApp. Es para la campaña **"Stratos Ai CRM - BVG"** que viste en screenshot 5, que usa Formularios Instantáneos.

En la misma app → **Webhook → Add subscription**:

1. **Object**: Page.
2. **Callback URL**: la misma de arriba (`https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest`).
3. **Verify token**: el mismo.
4. **Fields**: ✅ `leadgen`.
5. Suscribir la **Página de Facebook "El duke del Caribe"** a la app:
   ```bash
   curl -X POST \
     "https://graph.facebook.com/v21.0/<PAGE_ID>/subscribed_apps?subscribed_fields=leadgen" \
     -H "Authorization: Bearer $META_GRAPH_TOKEN"
   ```
   El `<PAGE_ID>` lo sacás de la URL de Business Suite o lo pegás más fácil con el botón "Subscribe app" en la página de la app de Meta.

Cuando publiques el Lead Form de la campaña BVG, cada submission llegará al webhook con `object=page` y `changes[].field=leadgen`. La Edge Function llama Graph API con `META_GRAPH_TOKEN`, lee el `field_data` (nombre, teléfono, email) y lo inserta en el CRM.

---

### 6. Publicar la campaña "Stratos Ai CRM - BVG" — cuando estés listo

Esa campaña que viste en borrador (screenshot 5) ya tiene **Formularios instantáneos** configurados, que es lo que necesitás para tener nombre+teléfono+email **obligatorios** en el formulario. Publicala cuando quieras encender ese canal.

Mientras tanto, los mensajes del **WhatsApp +52 984 877 9295** caen vía pasos 0-4.

---

## Cómo verificás que está funcionando

### Test del handshake (paso 3 ya lo hace)

Si Meta acepta la URL en "Verify and Save", está OK. Si no, prueba manual:

```bash
curl "https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest?hub.mode=subscribe&hub.verify_token=<TU_META_VERIFY_TOKEN>&hub.challenge=test123"
# Debe responder: test123
```

### Test end-to-end real

1. Desde cualquier WhatsApp de prueba, escribí al **+52 984 877 9295** algo como "Hola, quiero info de Bay View Grand".
2. En menos de 5 segundos, ejecutá en Supabase SQL Editor:
   ```sql
   SELECT received_at, source, sender_name, sender_phone, message_text, lead_id, processing_error
   FROM public.whatsapp_inbox
   ORDER BY received_at DESC LIMIT 3;

   SELECT name, phone, source, stage, asesor_name, created_at
   FROM public.leads
   WHERE source = 'whatsapp_inbound'
   ORDER BY created_at DESC LIMIT 3;
   ```
3. Tenés que ver: una fila en `whatsapp_inbox` con `source='meta_cloud_api'`, `processing_error=NULL`, `lead_id` lleno; y una fila en `leads` con tu nombre WhatsApp + número, asignado a Gael (si el `display_phone_number` matchea con `profiles.phone`).

---

## Sobre los leads viejos (los 60 campañas + Centro de Clientes Potenciales)

Los 439 leads del CSV son **Messenger Ads / IG DM ads** — Meta no captura teléfono ahí, sólo nombre + ad_id. **Importarlos al CRM no aporta valor sin contacto** (lo descartamos juntos).

Las únicas formas de rehidratarlos con teléfono son:

1. **Buscar uno por uno en Messenger/IG Inbox** y pedirle teléfono — manual, lento, baja conversión histórica (los más viejos son de 2023-2024).
2. **Campaña outbound de reactivación por Messenger** ("Hola, hace tiempo nos contactaste, ¿sigues interesado? Mándame tu WhatsApp"). Permite recuperar un porcentaje pequeño.
3. **No tocarlos.** Concentrarse en los nuevos que llegarán por:
   - WhatsApp +52 984 877 9295 (pasos 0-4 de arriba).
   - Lead Form de la campaña BVG cuando se publique (paso 5).

**Recomendación operativa:** olvidar el histórico inservible, dejar el sistema corriendo nuevo, y a los 30 días medir el volumen real de leads con contacto que sí entró al CRM. Eso es lo único que mueve la aguja.

---

## Bloqueos potenciales y solución

| Problema | Causa probable | Solución |
|---|---|---|
| Meta rechaza el webhook en "Verify and Save" | Verify JWT está ON en Supabase, o META_VERIFY_TOKEN no coincide | Apagar Verify JWT, confirmar que el token es idéntico (sin espacios). |
| Mensajes no llegan al webhook | La WABA no está suscrita a la app | Ir a WhatsApp → API Setup → Subscribed apps → suscribir. O `curl POST /<WABA_ID>/subscribed_apps`. |
| `whatsapp_inbox.processing_error = 'missing_or_invalid_phone'` | Algo raro en el payload de Meta | Revisar el `raw_payload` en esa fila; abrir issue. No debería pasar con Cloud API real. |
| El lead se crea pero `asesor_id` queda NULL | El `display_phone_number` que envía Meta no matchea con `profiles.phone` | El número de Meta puede venir con/sin `+`, con/sin guiones. Ajustar `profiles.phone` al formato exacto que mande Meta (lo vas a ver en `whatsapp_inbox.asesor_phone` del primer test). |

---

## Lo que NO necesitamos hacer (descartados)

- ❌ **Twilio**: el número ya está en Meta Cloud API directo, no hace falta intermediario.
- ❌ **Evolution API**: idem, riesgo ToS innecesario.
- ❌ **Esperar 15 días de "verificación"**: el estado "Sin conexión" no es verificación pendiente. Es solo "no hay app conectada al webhook". Se resuelve con los pasos 0-4.

---

## Resumen visual

```
WhatsApp del cliente
      │
      └─► +52 984 877 9295 (Duke del Caribe Real Estate WABA, ID 263671803501919)
              │
              └─► Meta Cloud API
                      │
                      └─► Webhook POST a:
                          https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest
                              │
                              ├─► Parser Meta Cloud API extrae from / profile.name / text.body
                              ├─► Anthropic Haiku 4.5 extrae project_interest / intent / budget
                              ├─► RPC ingest_inbound_lead valida nombre+telefono, dedupe
                              ├─► INSERT leads (asesor_id = Gael) + comunicaciones + audit_log
                              └─► whatsapp_inbox guarda el raw payload
```

Una vez configurado, **cero intervención humana**. Cada WhatsApp que llegue al número se vuelve un lead en el CRM con todos los datos posibles.
