# Plantilla de primer contacto (uso del asesor, no automático)

Mientras la verificación de WhatsApp Business sigue pendiente con Meta, el primer contacto se hace **manualmente** desde el WhatsApp Business app del asesor o por llamada (Retell ya cubre llamada vía `Agente llamada Duke del caribe`).

> Esta plantilla NO la dispara el script de ingest. Solo aparece en el reporte para que el asesor copie/pegue al momento del contacto.

## Versión corta WhatsApp / SMS

```
Hola {{nombre}}, soy {{asesor}} de Duke del Caribe / Stratos.
Vi que pediste información sobre {{proyecto}}.
¿Te llamo en los próximos 10 minutos o prefieres que te mande
los detalles por aquí?
```

## Versión para llamada (script Retell)

```
Buenos días {{nombre}}, hablo de Duke del Caribe a nombre de {{asesor}}.
Recibimos tu solicitud sobre {{proyecto}} y queríamos confirmar:
1) tu interés sigue activo,
2) horario en que te conviene una llamada de 15 minutos con asesor,
3) ciudad desde donde nos contactas.
```

## Reglas

- **Nunca** mandar más de 1 plantilla por hora al mismo lead.
- **Nunca** prometer precios sin confirmar disponibilidad y vigencia en `project_units`.
- Si el lead responde con interés concreto, mover `stage` a `'Contactado'` y subir `score` a 65.
