#!/usr/bin/env bash
# ============================================================
#  Mariana Ángeles López — setup remote & push to GitHub
# ============================================================
#  Antes de correr: crea el repo VACÍO en GitHub
#    https://github.com/organizations/iagents00/repositories/new
#    → Name: marianaanlo  → Public  → SIN README, SIN gitignore
# ============================================================
set -euo pipefail

REPO_OWNER="iagents00"
REPO_NAME="marianaanlo"
REMOTE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
BRANCH="main"

cd "$(dirname "$0")"

echo "▸ Repo destino: ${REPO_OWNER}/${REPO_NAME}"
echo "▸ Remote: ${REMOTE_URL}"
echo ""

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "${REMOTE_URL}"
  echo "✓ Remote 'origin' añadido."
else
  CURRENT=$(git remote get-url origin)
  if [ "${CURRENT}" != "${REMOTE_URL}" ]; then
    git remote set-url origin "${REMOTE_URL}"
    echo "✓ Remote 'origin' actualizado (era: ${CURRENT})."
  else
    echo "✓ Remote 'origin' ya estaba en el destino correcto."
  fi
fi

git branch -M "${BRANCH}"
echo "✓ Branch local en '${BRANCH}'."
echo ""
echo "▸ Pusheando…"
git push -u origin "${BRANCH}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Listo: https://github.com/${REPO_OWNER}/${REPO_NAME}"
echo ""
echo "Próximo paso — conectar Vercel:"
echo "  1. https://vercel.com/new"
echo "  2. Import Git Repository → ${REPO_OWNER}/${REPO_NAME}"
echo "  3. Project Name: ${REPO_NAME} (ya viene del vercel.json)"
echo "  4. Deploy"
echo ""
echo "URL final: https://marianaanlo.vercel.app"
echo "════════════════════════════════════════════════════════════"
