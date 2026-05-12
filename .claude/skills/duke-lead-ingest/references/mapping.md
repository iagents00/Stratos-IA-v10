# Mapping CSV de Meta Leads Center → tabla `leads` de Supabase

## Organización

| Concepto | Valor |
|---|---|
| organization_id | `00000000-0000-0000-0000-000000000001` |
| Nombre | Stratos Capital Group |
| Slug | stratos |

## Mapeo de columnas (CSV → leads)

Meta exporta el CSV con cabeceras tipo `full_name`, `email`, `phone_number`, `created_time`, `ad_id`, `adset_id`, `form_id`, `campaign_id` (id de Meta, NO el UUID de nuestra tabla `campaigns`), `campaign_name`, `lead_status`. Mapeo:

| CSV Meta | leads | Notas |
|---|---|---|
| `full_name` | `name` | title case + trim |
| `email` | `email` | lowercase + trim |
| `phone_number` | `phone`, `phone_normalized`, `whatsapp_phone_e164` | `phone` = raw; normalizar a E.164 con `phonenumbers`, default country MX |
| `created_time` | `fecha_ingreso` | ISO 8601 con timezone |
| `campaign_name` | `campaign` (texto libre) + lookup → `campaign_id` | ver tabla campañas abajo |
| (proyecto inferido del ad o de la campaña) | `project` (texto) + lookup → `project_id` | ver tabla proyectos abajo |
| `ad_id`, `adset_id`, `form_id` | `action_history` (jsonb append) | guardar como `{event: "csv_ingest_meta_ids", ad_id, adset_id, form_id, at}` |

Valores por defecto que añade el script:

```
source            = 'meta_lead_ads_csv'
stage             = 'Nuevo Registro'
score             = 50
is_new            = true
hot               = false
seguimientos      = 0
days_inactive     = 0
playbook          = []
tasks             = []
action_history    = [<csv_ingest event>]
```

## Campañas Duke (uuid → nombre)

Confirmadas en `public.campaigns`:

| uuid | name | channel |
|---|---|---|
| `da794741-9bf1-4523-9b7d-28865452245b` | BVG | other |
| `cf3cfbd5-6b55-4f26-af31-ba819f81597f` | CANCUN | other |
| `604a12ca-409c-4834-b90c-230e04b25204` | Facebook Ads · Bay View Grand | facebook |
| `dafbe3d6-4d63-4cb3-ad52-9215432d8204` | Facebook Ads · Cancún | facebook |
| `9e0ad3a3-7b3f-415c-9a1d-eec559418792` | Instagram Ads | instagram |

> **Pendiente:** crear una campaña explícita "Duke del Caribe" si los anuncios del cliente no caen claramente en una existente. Confirmar con Oscar antes de crearla.

Heurística de mapeo `campaign_name` (Meta) → `campaigns.id`:

- contiene `bay view` o `bvg` → `604a12ca-...` (Facebook Ads · Bay View Grand) o `da794741-...` (BVG)
- contiene `cancun` o `cancún` → `dafbe3d6-...` o `cf3cfbd5-...`
- contiene `instagram` o canal del ad es Instagram → `9e0ad3a3-...`
- No match → **preguntar al operador**.

## Proyectos Duke (uuid → nombre)

Confirmados en `public.projects`:

| uuid | name |
|---|---|
| `5b549cb8-a00b-4a00-bef2-7d7eff3c218c` | Bay View Grand |
| `b6de15b5-635e-42db-b833-77da5206d4b2` | OCEAN FRONT |
| `03ff644b-6bb2-4bc7-9a55-fb4385ff92a3` | OCEAN VIEW |
| `056e0f80-85f6-458d-bc3d-45ef298617a2` | OCEANVIEW |
| `33b2af60-aa05-4fdc-849d-218a31d7da5e` | DEPA 2 BDR VIVIR |
| `3058daa2-ecab-474a-9458-e9299f9a9261` | DEPA 2BDR |
| `6c5c9c18-f564-4ef5-8b3c-84a7a31600ba` | DEPA OCEAN FRONT INVERSIÓN Y VIVIR |
| `f10434ed-6cc3-45a2-92a8-b65d49d8c2a9` | ENTREGA INMEDIATA /TORRE 25, BAGA, KAAB ON THE BEACH |
| `57e05765-2415-4ff2-9bde-2182fa5758b7` | ESTUDIO DEPA CERCA DE LA PLAYA |
| `ed0d28ff-9fb7-4c9f-a5cc-3a15e0dda7d3` | Gobernador 28 |
| `308f09da-26d2-4382-b8c6-dfee77d81600` | Monarca 28 |
| `54186b97-cd57-46d4-8123-2e49155af866` | PARAVIAN |
| `c803bc39-c039-4b4c-a308-5b1d9cf0d945` | PRE VENTA Y ENTREGA INMEDIATA |
| `631040e0-0938-4b76-a280-9ef88838f958` | Torre Esmeralda |

## Reglas de deduplicación

Buscar coincidencia previa en `leads` con:

```sql
SELECT id, asesor_id, stage, deleted_at
FROM leads
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND deleted_at IS NULL
  AND (phone_normalized = :phone_norm OR (email IS NOT NULL AND email = :email));
```

Si hay match:
- **No insertar.**
- Append en `action_history` del lead existente:
  ```json
  {"type": "lead_reentry", "source": "meta_lead_ads_csv", "campaign": "...", "at": "<ts>", "operator": "<name>"}
  ```
- Insertar fila en `audit_log` con `action='reentry_ignored'`.
- Reportar al operador con el `id` existente y a qué asesor está asignado.
