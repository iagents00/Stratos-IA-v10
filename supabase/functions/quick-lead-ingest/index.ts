// supabase/functions/quick-lead-ingest/index.ts
//
// Endpoint HTTP unico para meter leads inbound al CRM Stratos AI hoy mismo,
// agnostico al canal (Twilio / Chatwoot / Telegram forward / paste manual / Evolution).
//
// Body JSON esperado (todos los campos son opcionales excepto message_text):
// {
//   "source": "twilio" | "chatwoot" | "telegram_forward" | "manual_paste" | "evolution_api",
//   "organization_id": "<uuid>",         // default: Stratos
//   "asesor_id": "<uuid>",               // si lo conoces
//   "asesor_phone": "+52..." ,           // si no conoces asesor_id pero si su numero
//   "sender_phone": "+52...",            // numero del cliente
//   "sender_name": "Nombre WhatsApp",
//   "message_text": "Hola, vi su anuncio del depa en Cancun...",
//   "media_urls": ["..."],
//   "project_id": "<uuid>",              // si se conoce
//   "campaign_id": "<uuid>",
//   "operator": "Oscar Galvez"           // quien dispara (auditoria)
// }
//
// Header: x-shared-secret: <QUICK_INGEST_SECRET>
//
// Que hace:
// 1. Normaliza telefono del sender a E.164 (default MX).
// 2. Llama a Anthropic Haiku 4.5 para extraer {name, email, phone, project_interest, budget, notes}.
//    Si ANTHROPIC_API_KEY no esta seteada, salta extraccion (usa sender_name nada mas).
// 3. Llama RPC public.ingest_inbound_lead que dedupa por phone/email, upserta lead,
//    inserta comunicacion + audit_log.
// 4. Devuelve {lead_id, is_new, asesor_id, asesor_name, extracted}.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SHARED_SECRET = Deno.env.get("QUICK_INGEST_SECRET") ?? "";
const DEFAULT_COUNTRY = (Deno.env.get("DEFAULT_COUNTRY") ?? "MX").toUpperCase();
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Normalizacion E.164 simple (MX default). Acepta +<digitos>, 10 digitos MX, 12 digitos con 52.
function normalizeMxPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return /^\+\d{8,15}$/.test(digits) ? digits : null;
  }
  if (DEFAULT_COUNTRY === "MX") {
    if (/^52\d{10}$/.test(digits)) return `+${digits}`;
    if (/^\d{10}$/.test(digits)) return `+52${digits}`;
    if (/^1\d{10}$/.test(digits)) return `+${digits}`; // 1XXXXXXXXXX (US)
  }
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`;
  return null;
}

const EXTRACTION_TOOL = {
  name: "registrar_lead",
  description:
    "Registra los datos extraidos del primer mensaje de WhatsApp inbound de un cliente potencial inmobiliario.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre completo si lo dice. null si no se sabe." },
      email: { type: "string", description: "Correo si lo menciona. null si no." },
      phone_in_message: {
        type: "string",
        description: "Telefono alternativo si lo escribe en el mensaje (E.164). null si no.",
      },
      project_interest: {
        type: "string",
        description:
          "Nombre del proyecto o tipo de producto que pregunta (Bay View Grand, Ocean Front, depa 2 recamaras, etc).",
      },
      budget: { type: "string", description: "Presupuesto mencionado si lo hay (texto libre)." },
      preferred_contact_time: { type: "string" },
      city: { type: "string", description: "Ciudad o lugar desde donde escribe si lo menciona." },
      intent: {
        type: "string",
        enum: ["inversion", "vivir", "renta", "otro", "desconocido"],
      },
      notes: { type: "string", description: "Resumen en una linea para el asesor." },
    },
    required: ["name", "intent", "notes"],
  },
} as const;

const EXTRACTION_SYSTEM_PROMPT = `Eres un asistente que extrae datos estructurados del primer mensaje de un cliente potencial inmobiliario en Mexico/Caribe (Cancun, Riviera Maya). Llamaras a la herramienta registrar_lead con lo que puedas inferir, dejando como null lo que no este en el mensaje. NO inventes. Si el mensaje es ambiguo, marca intent="desconocido" y describe brevemente.

Pistas frecuentes en este negocio:
- Proyectos: Bay View Grand, Ocean Front, Ocean View, Torre Esmeralda, Monarca 28, Paravian, Gobernador 28.
- Productos: depa 1/2/3 recamaras, estudio, ocean view, ocean front, entrega inmediata, preventa.
- Idiomas: espanol mexicano coloquial; a veces ingles.
- Si solo dice "Hola" o "Info por favor", marca intent="desconocido" y notes="Solo saludo inicial, requiere seguimiento manual".`;

async function extractWithAnthropic(messageText: string, senderName?: string | null) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 512,
        system: [
          {
            type: "text",
            text: EXTRACTION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: "registrar_lead" },
        messages: [
          {
            role: "user",
            content:
              `Nombre WhatsApp del remitente: ${senderName ?? "(desconocido)"}\n\nMensaje del cliente:\n"""${messageText}"""`,
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.error("Anthropic error", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const toolUse = (data?.content ?? []).find(
      (b: { type?: string }) => b.type === "tool_use",
    );
    return toolUse?.input ?? null;
  } catch (err) {
    console.error("Anthropic call failed", err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (SHARED_SECRET && req.headers.get("x-shared-secret") !== SHARED_SECRET) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const messageText = String(body.message_text ?? "").trim();
  if (!messageText) return jsonResponse({ error: "message_text_required" }, 400);

  const senderPhoneRaw = (body.sender_phone as string | undefined) ?? null;
  const senderPhoneNorm = normalizeMxPhone(senderPhoneRaw);
  const senderName = (body.sender_name as string | undefined) ?? null;

  const extracted =
    (await extractWithAnthropic(messageText, senderName)) ?? {
      name: senderName ?? null,
      intent: "desconocido",
      notes: "Sin extraccion LLM (clave ausente o error). Revision manual requerida.",
    };

  if (extracted?.phone_in_message) {
    const e164 = normalizeMxPhone(String(extracted.phone_in_message));
    extracted.phone = e164;
    delete extracted.phone_in_message;
  }

  const payload = {
    organization_id: body.organization_id ?? null,
    source: body.source ?? "manual_paste",
    asesor_id: body.asesor_id ?? null,
    asesor_phone: body.asesor_phone ?? null,
    sender_phone: senderPhoneRaw,
    sender_phone_normalized: senderPhoneNorm,
    sender_name: senderName,
    message_text: messageText,
    media_urls: body.media_urls ?? [],
    project_id: body.project_id ?? null,
    campaign_id: body.campaign_id ?? null,
    operator: body.operator ?? null,
    extracted,
  };

  const { data, error } = await supabase.rpc("ingest_inbound_lead", { payload });
  if (error) {
    console.error("RPC failed", error);
    return jsonResponse({ error: "rpc_failed", details: error.message }, 500);
  }

  return jsonResponse({ ok: true, result: data, extracted });
});
