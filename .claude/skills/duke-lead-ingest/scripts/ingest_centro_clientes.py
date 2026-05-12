#!/usr/bin/env python3
"""
Ingest del CSV de Meta "Centro de Clientes Potenciales" (Customer Center) al CRM Stratos AI.

Este formato es distinto al de Lead Ads:
- Columnas en espanol: Fecha de creación, Nombre, Correo electronico, Origen, Formulario,
  Canal, Etapa, Propietario, Etiquetas, Teléfono, Numero de teléfono secundario, Numero de WhatsApp.
- Casi siempre SIN email/telefono (son leads de Messenger Ads / IG Direct).
- Las "Etiquetas" contienen ad_id.XXXXXXXX que sirve para mapear campana.

Uso tipico:
    export SUPABASE_URL='https://glulgyhkrqpykxmujodb.supabase.co'
    export SUPABASE_SERVICE_ROLE_KEY='<service_role_key>'
    export OPERATOR_NAME='Oscar Galvez'

    # Dry run (solo reporta, no inserta).
    python3 ingest_centro_clientes.py \\
        --csv ~/Downloads/leads.csv \\
        --asesor-id 941ad724-dc5d-46a5-8487-fda87a297b31 \\
        --since 2025-11-01 \\
        --dry-run

    # Ejecucion real (sin --dry-run).
"""

import argparse
import csv
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

import requests


ORG_ID = "00000000-0000-0000-0000-000000000001"
AD_ID_RE = re.compile(r"ad_id\.(\d+)")


def parse_csv_dt(s: str) -> datetime:
    return datetime.strptime(s.strip(), "%m/%d/%Y %I:%M%p")


def supabase_request(method, path, params=None, body=None):
    url = f"{os.environ['SUPABASE_URL']}/rest/v1{path}"
    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    r = requests.request(method, url, headers=headers, params=params, json=body, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase {method} {path}: {r.status_code} {r.text}")
    return r.json() if r.content else []


def normalize_phone(raw: Optional[str], default_country="MX") -> Optional[str]:
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if raw.strip().startswith("+"):
        return digits
    if default_country == "MX":
        if re.fullmatch(r"\d{10}", digits):
            return f"52{digits}"
        if re.fullmatch(r"52\d{10}", digits):
            return digits
        if re.fullmatch(r"1\d{10}", digits):
            return digits
    return digits if 10 <= len(digits) <= 15 else None


def score_for(stage: str, days_old: int) -> int:
    if stage == "Calificado":
        return 85
    if days_old <= 30:
        return 70
    if days_old <= 90:
        return 60
    if days_old <= 365:
        return 50
    return 35


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--asesor-id", required=True, help="UUID del asesor a quien asignar todos los leads.")
    ap.add_argument("--since", help="Solo importar leads >= esta fecha (YYYY-MM-DD).")
    ap.add_argument("--organization-id", default=ORG_ID)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for env in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not os.environ.get(env):
            print(f"ERROR: env var {env} no definida.", file=sys.stderr)
            sys.exit(2)

    since = datetime.strptime(args.since, "%Y-%m-%d") if args.since else None
    operator = os.environ.get("OPERATOR_NAME", "ingest_centro_clientes")
    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Confirmar asesor existe.
    if not args.dry_run:
        rows = supabase_request("GET", "/profiles",
            params={"id": f"eq.{args.asesor_id}", "select": "id,name,role,active"})
        if not rows:
            print(f"ERROR: asesor_id {args.asesor_id} no encontrado.", file=sys.stderr)
            sys.exit(3)
        asesor = rows[0]
        if not asesor.get("active"):
            print(f"ERROR: asesor {asesor['name']} no esta active.", file=sys.stderr)
            sys.exit(3)
        asesor_name = asesor["name"]
    else:
        asesor_name = "(dry-run)"

    with open(args.csv, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    summary = {
        "batch_id": batch_id,
        "csv_file": os.path.abspath(args.csv),
        "operator": operator,
        "asesor_id": args.asesor_id,
        "asesor_name": asesor_name,
        "since": args.since,
        "started_at": now.isoformat(),
        "total_rows": len(rows),
        "filtered_in": 0,
        "inserted": 0,
        "reentries": 0,
        "rejected": [],
        "by_channel": {},
        "by_stage": {},
    }

    for idx, row in enumerate(rows, start=1):
        fecha_str = row.get("Fecha de creación") or row.get("﻿Fecha de creación") or ""
        try:
            fecha = parse_csv_dt(fecha_str)
        except Exception as e:
            summary["rejected"].append({"row": idx, "reason": f"fecha_invalida: {e}", "raw": dict(row)})
            continue

        if since and fecha < since:
            continue

        summary["filtered_in"] += 1
        name = (row.get("Nombre") or "").strip()
        if not name:
            summary["rejected"].append({"row": idx, "reason": "sin_nombre", "raw": dict(row)})
            continue

        canal = (row.get("Canal") or "").strip().lower() or "desconocido"
        origen = (row.get("Origen") or "").strip().lower()
        etapa = (row.get("Etapa") or "Registrado").strip()
        etiquetas = (row.get("Etiquetas") or "").strip()
        email = (row.get("Correo electrónico") or "").strip().lower() or None
        phone_raw = (row.get("Teléfono") or "").strip() or None
        whatsapp_raw = (row.get("Número de WhatsApp") or "").strip() or None
        contact = phone_raw or whatsapp_raw
        phone_norm = normalize_phone(contact)

        ad_ids = list(set(AD_ID_RE.findall(etiquetas)))
        days_old = (now.replace(tzinfo=None) - fecha).days
        score = score_for(etapa, days_old)
        is_hot = (etapa == "Calificado")

        summary["by_channel"][canal] = summary["by_channel"].get(canal, 0) + 1
        summary["by_stage"][etapa] = summary["by_stage"].get(etapa, 0) + 1

        if args.dry_run:
            summary["inserted"] += 1
            continue

        # Dedup: por phone si hay; si no, por (organization_id, name, canal).
        existing = None
        if phone_norm:
            r = supabase_request("GET", "/leads", params={
                "organization_id": f"eq.{args.organization_id}",
                "phone_normalized": f"eq.{phone_norm}",
                "deleted_at": "is.null",
                "select": "id,name,asesor_id,asesor_name,stage,action_history",
                "limit": "1",
            })
            existing = r[0] if r else None
        if not existing:
            r = supabase_request("GET", "/leads", params={
                "organization_id": f"eq.{args.organization_id}",
                "name": f"eq.{name}",
                "source": "eq.meta_centro_clientes_potenciales",
                "deleted_at": "is.null",
                "select": "id,name,asesor_id,action_history",
                "limit": "1",
            })
            existing = r[0] if r else None

        event = {
            "type": "csv_centro_clientes_import",
            "source": "meta_centro_clientes_potenciales",
            "csv_fecha": fecha.isoformat(),
            "canal_meta": canal,
            "origen_meta": origen,
            "etapa_meta": etapa,
            "etiquetas": etiquetas,
            "ad_ids": ad_ids,
            "operator": operator,
            "batch_id": batch_id,
            "at": now.isoformat(),
        }

        if existing:
            new_history = (existing.get("action_history") or []) + [event]
            supabase_request("PATCH", "/leads",
                params={"id": f"eq.{existing['id']}"},
                body={"action_history": new_history, "updated_at": now.isoformat()})
            supabase_request("POST", "/audit_log", body={
                "actor_id": args.asesor_id,
                "actor_name": f"ingest_centro_clientes ({operator})",
                "actor_role": "ingest",
                "entity_type": "lead",
                "entity_id": existing["id"],
                "action": "UPDATE",
                "metadata": {"batch_id": batch_id, "action_detail": "centro_clientes_reentry"},
                "organization_id": args.organization_id,
            })
            summary["reentries"] += 1
            continue

        lead_payload = {
            "organization_id": args.organization_id,
            "name": name.title(),
            "email": email,
            "phone": contact,
            "phone_normalized": contact,   # trigger del CRM lo re-normaliza
            "whatsapp_phone_e164": contact,
            "source": "meta_centro_clientes_potenciales",
            "stage": etapa if etapa in ("Calificado", "Registrado") else "Nuevo Registro",
            "score": score,
            "is_new": True,
            "hot": is_hot,
            "seguimientos": 0,
            "days_inactive": max(0, days_old),
            "playbook": [],
            "tasks": [],
            "action_history": [event],
            "campaign": None,
            "asesor_id": args.asesor_id,
            "asesor_name": asesor_name,
            "fecha_ingreso": fecha.isoformat(),
            "notas": f"Importado de Centro de Clientes Potenciales (Meta). Canal: {canal}. Origen: {origen}. Etiquetas: {etiquetas[:200]}",
        }
        try:
            inserted = supabase_request("POST", "/leads", body=lead_payload)
        except RuntimeError as e:
            summary["rejected"].append({"row": idx, "reason": f"insert_fail: {e}", "raw": {"name": name}})
            continue
        lead_id = inserted[0]["id"]

        supabase_request("POST", "/lead_assignments", body={
            "lead_id": lead_id,
            "organization_id": args.organization_id,
            "from_asesor_id": None,
            "to_asesor_id": args.asesor_id,
            "changed_by": None,
            "reason": "import_centro_clientes",
            "metadata": {"batch_id": batch_id, "operator": operator, "csv_file": summary["csv_file"]},
        })
        supabase_request("POST", "/audit_log", body={
            "actor_id": args.asesor_id,
            "actor_name": f"ingest_centro_clientes ({operator})",
            "actor_role": "ingest",
            "entity_type": "lead",
            "entity_id": lead_id,
            "action": "INSERT",
            "metadata": {
                "batch_id": batch_id,
                "action_detail": "create_centro_clientes",
                "ad_ids": ad_ids,
                "canal": canal,
                "etapa": etapa,
            },
            "organization_id": args.organization_id,
        })
        summary["inserted"] += 1

    summary["finished_at"] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
