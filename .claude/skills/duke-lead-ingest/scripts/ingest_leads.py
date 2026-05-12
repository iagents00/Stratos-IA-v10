#!/usr/bin/env python3
"""
Ingest Meta Lead Ads CSV into Stratos AI CRM (Supabase).

Usage:
    export SUPABASE_URL='https://glulgyhkrqpykxmujodb.supabase.co'
    export SUPABASE_SERVICE_ROLE_KEY='<service_role_key>'
    export OPERATOR_NAME='Oscar Galvez'

    python3 ingest_leads.py \
        --csv /path/to/leads.csv \
        --campaign-id <uuid> \
        --project-id <uuid> \
        --default-country MX \
        --dry-run

Requires:
    pip install requests phonenumbers
"""

import argparse
import csv
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

import phonenumbers
import requests


ORG_ID = "00000000-0000-0000-0000-000000000001"  # Stratos Capital Group

CSV_HEADER_ALIASES = {
    "name": ["full_name", "name", "nombre", "lead_name"],
    "email": ["email", "correo", "email_address"],
    "phone": ["phone_number", "phone", "telefono", "teléfono", "mobile"],
    "created_time": ["created_time", "created_at", "fecha", "submitted_at"],
    "ad_id": ["ad_id"],
    "adset_id": ["adset_id"],
    "form_id": ["form_id", "lead_form_id"],
    "campaign_name": ["campaign_name", "campaña", "campaign"],
}


def pick(row: dict, key: str) -> Optional[str]:
    for alias in CSV_HEADER_ALIASES[key]:
        if alias in row and row[alias] not in (None, ""):
            return str(row[alias]).strip()
        for k in row.keys():
            if k.lower().strip() == alias.lower():
                v = row[k]
                if v not in (None, ""):
                    return str(v).strip()
    return None


def normalize_phone(raw: str, default_country: str) -> Optional[str]:
    if not raw:
        return None
    try:
        parsed = phonenumbers.parse(raw, default_country)
        if not phonenumbers.is_valid_number(parsed):
            return None
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        return None


def supabase_request(method: str, path: str, params: dict = None, body=None):
    url = f"{os.environ['SUPABASE_URL']}/rest/v1{path}"
    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    resp = requests.request(method, url, headers=headers, params=params, json=body, timeout=30)
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase {method} {path}: {resp.status_code} {resp.text}")
    return resp.json() if resp.content else []


def find_existing_lead(phone_e164: Optional[str], email: Optional[str]) -> Optional[dict]:
    filters = []
    if phone_e164:
        filters.append(f"phone_normalized.eq.{phone_e164}")
    if email:
        filters.append(f"email.eq.{email}")
    if not filters:
        return None
    params = {
        "organization_id": f"eq.{ORG_ID}",
        "deleted_at": "is.null",
        "or": f"({','.join(filters)})",
        "select": "id,asesor_id,asesor_name,stage,action_history",
        "limit": "1",
    }
    rows = supabase_request("GET", "/leads", params=params)
    return rows[0] if rows else None


def list_round_robin_advisors() -> list[dict]:
    params = {
        "organization_id": f"eq.{ORG_ID}",
        "active": "eq.true",
        "role": "eq.asesor",
        "select": "id,name",
        "order": "name.asc",
    }
    return supabase_request("GET", "/profiles", params=params)


def count_recent_assignments_per_advisor(advisor_ids: list[str]) -> dict[str, int]:
    """Round-robin sesgado a quien tiene menos asignaciones recientes (ultimas 24h)."""
    counts = {aid: 0 for aid in advisor_ids}
    if not advisor_ids:
        return counts
    params = {
        "organization_id": f"eq.{ORG_ID}",
        "created_at": f"gte.{(datetime.now(timezone.utc).date()).isoformat()}",
        "select": "to_asesor_id",
        "to_asesor_id": f"in.({','.join(advisor_ids)})",
    }
    rows = supabase_request("GET", "/lead_assignments", params=params)
    for r in rows:
        aid = r.get("to_asesor_id")
        if aid in counts:
            counts[aid] += 1
    return counts


def pick_next_advisor(advisors: list[dict]) -> dict:
    if not advisors:
        raise RuntimeError("No hay asesores activos para round-robin.")
    counts = count_recent_assignments_per_advisor([a["id"] for a in advisors])
    return min(advisors, key=lambda a: (counts.get(a["id"], 0), a["name"]))


def append_action_history(existing: list, event: dict) -> list:
    history = existing if isinstance(existing, list) else []
    history.append(event)
    return history


def write_audit(entity_id: str, action: str, metadata: dict):
    body = {
        "actor_id": None,
        "actor_name": f"Skill duke-lead-ingest ({os.environ.get('OPERATOR_NAME', 'unknown')})",
        "actor_role": "skill",
        "entity_type": "lead",
        "entity_id": entity_id,
        "action": action,
        "metadata": metadata,
        "organization_id": ORG_ID,
    }
    supabase_request("POST", "/audit_log", body=body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--campaign-id", required=False)
    ap.add_argument("--project-id", required=False)
    ap.add_argument("--default-country", default="MX")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for env in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not os.environ.get(env):
            print(f"ERROR: env var {env} no definida.", file=sys.stderr)
            sys.exit(2)

    batch_id = str(uuid.uuid4())
    operator = os.environ.get("OPERATOR_NAME", "unknown")
    now_iso = datetime.now(timezone.utc).isoformat()

    advisors = list_round_robin_advisors() if not args.dry_run else []
    if not args.dry_run and not advisors:
        print("ERROR: no se encontraron asesores activos.", file=sys.stderr)
        sys.exit(3)

    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    summary = {
        "batch_id": batch_id,
        "csv_file": os.path.abspath(args.csv),
        "operator": operator,
        "started_at": now_iso,
        "total_rows": len(rows),
        "inserted": 0,
        "reentries": 0,
        "rejected": [],
        "assignments": {},
    }

    for idx, row in enumerate(rows, start=1):
        name = pick(row, "name")
        email = (pick(row, "email") or "").lower() or None
        phone_raw = pick(row, "phone")
        phone_e164 = normalize_phone(phone_raw, args.default_country) if phone_raw else None
        created_time = pick(row, "created_time")
        campaign_name = pick(row, "campaign_name")

        if not name or (not phone_e164 and not email):
            summary["rejected"].append({"row": idx, "reason": "missing name or contact", "raw": row})
            continue

        meta_ids = {
            "ad_id": pick(row, "ad_id"),
            "adset_id": pick(row, "adset_id"),
            "form_id": pick(row, "form_id"),
        }

        existing = find_existing_lead(phone_e164, email) if not args.dry_run else None

        if existing:
            event = {
                "type": "lead_reentry",
                "source": "meta_lead_ads_csv",
                "campaign": campaign_name,
                "at": now_iso,
                "operator": operator,
                "batch_id": batch_id,
                "meta_ids": meta_ids,
            }
            new_history = append_action_history(existing.get("action_history"), event)
            supabase_request(
                "PATCH",
                "/leads",
                params={"id": f"eq.{existing['id']}"},
                body={"action_history": new_history, "updated_at": now_iso},
            )
            write_audit(existing["id"], "reentry_ignored", {
                "batch_id": batch_id,
                "csv_file": summary["csv_file"],
                "operator": operator,
                "current_asesor_id": existing.get("asesor_id"),
                "current_asesor_name": existing.get("asesor_name"),
                "current_stage": existing.get("stage"),
            })
            summary["reentries"] += 1
            continue

        if args.dry_run:
            summary["inserted"] += 1
            continue

        advisor = pick_next_advisor(advisors)
        lead_payload = {
            "organization_id": ORG_ID,
            "name": name.title(),
            "email": email,
            "phone": phone_raw,
            "phone_normalized": phone_e164,
            "whatsapp_phone_e164": phone_e164,
            "source": "meta_lead_ads_csv",
            "stage": "Nuevo Registro",
            "score": 50,
            "is_new": True,
            "hot": False,
            "seguimientos": 0,
            "days_inactive": 0,
            "playbook": [],
            "tasks": [],
            "action_history": [{
                "type": "csv_ingest",
                "source": "meta_lead_ads_csv",
                "campaign": campaign_name,
                "at": now_iso,
                "operator": operator,
                "batch_id": batch_id,
                "meta_ids": meta_ids,
            }],
            "campaign": campaign_name,
            "campaign_id": args.campaign_id,
            "project_id": args.project_id,
            "asesor_id": advisor["id"],
            "asesor_name": advisor["name"],
            "fecha_ingreso": created_time or now_iso,
        }
        inserted = supabase_request("POST", "/leads", body=lead_payload)
        lead_id = inserted[0]["id"]

        supabase_request("POST", "/lead_assignments", body={
            "lead_id": lead_id,
            "organization_id": ORG_ID,
            "from_asesor_id": None,
            "to_asesor_id": advisor["id"],
            "changed_by": None,
            "reason": "auto_round_robin_csv_ingest",
            "metadata": {"batch_id": batch_id, "operator": operator},
        })

        write_audit(lead_id, "create", {
            "batch_id": batch_id,
            "csv_file": summary["csv_file"],
            "operator": operator,
            "asesor_id": advisor["id"],
            "asesor_name": advisor["name"],
            "campaign": campaign_name,
            "meta_ids": meta_ids,
        })

        summary["inserted"] += 1
        summary["assignments"][advisor["name"]] = summary["assignments"].get(advisor["name"], 0) + 1

    summary["finished_at"] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
