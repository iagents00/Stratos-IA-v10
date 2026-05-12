# Ejemplos de corridas reales

Guardar aquí las primeras 2-3 corridas manuales para que la Skill aprenda los edge cases reales del cliente.

Para cada corrida, crear una carpeta `YYYY-MM-DD_lote_<n>/` con:

- `input.csv` — el CSV original (anonimizar si va a commitearse: emails y teléfonos parciales).
- `report.json` — el JSON que devolvió `ingest_leads.py`.
- `notas.md` — qué edge cases aparecieron, qué decidió el operador, qué hay que actualizar en `SKILL.md` o `references/mapping.md`.

Cuando aparezca un patrón nuevo (formato de teléfono raro, campaign_name no mapeado, lead duplicado entre campañas, etc.), levantar la regla en este SKILL antes de la siguiente corrida.
