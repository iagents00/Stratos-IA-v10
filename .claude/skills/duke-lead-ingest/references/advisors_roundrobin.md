# Asesores elegibles para round-robin

Solo entran al round-robin los `profiles` con `organization_id='00000000-0000-0000-0000-000000000001'`, `role='asesor'`, `active=true`.

**Super_admin no entra al round-robin** (Oscar, Alex, Ivan, Emmanuel, Ken, Admin Stratos). Si Oscar quiere que un super_admin reciba leads, se le pide a la Skill explícitamente.

## Lista actual (snapshot 2026-05-12)

| uuid | name | role |
|---|---|---|
| `afe12551-afa5-4813-b93a-d86373d4c43a` | Alexia Santillán | asesor |
| `cc1030f0-d738-49fe-972d-7acbb6f48cea` | Araceli Oneto | asesor |
| `f509500d-2e44-4a46-ac21-8680bd566778` | Cecilia Mendoza | asesor |
| `941ad724-dc5d-46a5-8487-fda87a297b31` | Gael G | asesor |
| `b342f891-860c-4ab7-8369-ca6aa5b2dd7e` | nk23 | asesor |
| `68c4ecb6-ef4e-4d84-bfd3-99deff12d8d0` | Themis Nickthel | asesor |
| `a60c4f4e-bafe-4b3b-89a5-fa80b6d1693e` | Victor Benitez | asesor |

El script no lee esta lista, consulta `profiles` en cada corrida. Este archivo es referencia humana — si algún asesor cambia, se actualiza solo desde Supabase.

## Algoritmo de selección

`scripts/ingest_leads.py` no usa rotación estricta; usa **menor carga primero** sobre el día actual:

1. Listar asesores elegibles.
2. Para cada uno, contar filas en `lead_assignments` con `created_at >= hoy_00:00 UTC` donde `to_asesor_id = uuid`.
3. Elegir el de **menor cuenta**; desempate alfabético por nombre.

Esto previene que el mismo asesor reciba todo el lote y mantiene equidad sin requerir estado persistente.
