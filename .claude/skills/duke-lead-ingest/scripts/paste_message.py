#!/usr/bin/env python3
"""
Paste-a-WhatsApp-message → Stratos AI CRM.

Uso desde Claude Code (operador):
    export QUICK_INGEST_URL='https://glulgyhkrqpykxmujodb.functions.supabase.co/quick-lead-ingest'
    export QUICK_INGEST_SECRET='<shared_secret>'
    export OPERATOR_NAME='Oscar Galvez'

    python3 paste_message.py \\
        --asesor-id <uuid> \\
        --sender-phone '+529981234567' \\
        --sender-name 'Juan Perez' \\
        --message 'Hola, vi su anuncio de Bay View Grand...'

O en modo interactivo (sin --message): el script abre tu $EDITOR para pegar el texto.

Salida: JSON con {lead_id, is_new, asesor_id, asesor_name, extracted}.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request


def read_from_editor() -> str:
    editor = os.environ.get("EDITOR") or "nano"
    with tempfile.NamedTemporaryFile("w+", suffix=".txt", delete=False) as f:
        f.write("# Pega el mensaje del cliente, guarda y cierra. Las lineas con # se ignoran.\n")
        path = f.name
    try:
        subprocess.run([editor, path], check=True)
        with open(path) as f:
            lines = [l for l in f.read().splitlines() if not l.startswith("#")]
        return "\n".join(lines).strip()
    finally:
        os.unlink(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--asesor-id", help="UUID del asesor que recibio el mensaje (preferido).")
    ap.add_argument("--asesor-phone", help="Telefono corporativo del asesor (fallback si no hay --asesor-id).")
    ap.add_argument("--sender-phone", required=True, help="Telefono del cliente, ideal E.164 (+52...).")
    ap.add_argument("--sender-name", help="Nombre del cliente segun WhatsApp.")
    ap.add_argument("--message", help="Mensaje completo. Si se omite, se abre $EDITOR para pegarlo.")
    ap.add_argument("--source", default="manual_paste",
                    choices=["manual_paste", "telegram_forward", "twilio", "chatwoot", "evolution_api"])
    ap.add_argument("--organization-id", default="00000000-0000-0000-0000-000000000001")
    ap.add_argument("--campaign-id")
    ap.add_argument("--project-id")
    args = ap.parse_args()

    url = os.environ.get("QUICK_INGEST_URL")
    if not url:
        print("ERROR: QUICK_INGEST_URL no esta definida.", file=sys.stderr)
        sys.exit(2)

    message = args.message or read_from_editor()
    if not message:
        print("ERROR: mensaje vacio, abortando.", file=sys.stderr)
        sys.exit(2)

    body = {
        "source": args.source,
        "organization_id": args.organization_id,
        "asesor_id": args.asesor_id,
        "asesor_phone": args.asesor_phone,
        "sender_phone": args.sender_phone,
        "sender_name": args.sender_name,
        "message_text": message,
        "campaign_id": args.campaign_id,
        "project_id": args.project_id,
        "operator": os.environ.get("OPERATOR_NAME", "claude_code_local"),
    }

    headers = {"content-type": "application/json"}
    if os.environ.get("QUICK_INGEST_SECRET"):
        headers["x-shared-secret"] = os.environ["QUICK_INGEST_SECRET"]
    if os.environ.get("SUPABASE_ANON_KEY"):
        headers["authorization"] = f"Bearer {os.environ['SUPABASE_ANON_KEY']}"

    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(3)

    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
