#!/usr/bin/env bash
#
# Menyiapkan repo dan label di organisasi GitHub, SETELAH organisasinya
# dibuat manual lewat web.
#
# GitHub tidak menyediakan pembuatan organisasi lewat API publik maupun
# CLI — itu harus lewat https://github.com/account/organizations/new.
# Skrip ini mengurus semua yang bisa diotomasi setelahnya.
#
# Jalankan dari root repo:
#   bash scripts/setup-org.sh

set -euo pipefail

ORG="mancing-senja"
REPO="senja"

echo "==> Cek gh"
if ! command -v gh >/dev/null; then
  echo "gh belum terpasang: https://cli.github.com" >&2
  exit 1
fi
gh auth status >/dev/null

echo "==> Cek organisasi $ORG"
if ! gh api "orgs/$ORG" >/dev/null 2>&1; then
  cat >&2 <<EOF

Organisasi "$ORG" belum ada atau belum bisa diakses.

Bikin dulu di sini (gratis, ~1 menit):
  https://github.com/account/organizations/new

Pilih paket Free, nama organisasi: $ORG

Kalau organisasinya sudah ada tapi skrip ini tetap gagal, token gh kamu
mungkin kurang scope. Perbaiki dengan:
  gh auth refresh -h github.com -s admin:org,repo,workflow

EOF
  exit 1
fi

echo "==> Bikin repo $ORG/$REPO"
if gh repo view "$ORG/$REPO" >/dev/null 2>&1; then
  echo "    sudah ada, dilewati"
else
  gh repo create "$ORG/$REPO" \
    --public \
    --source=. \
    --remote=origin \
    --description "Game mancing santai multipemain. Semua art di-generate lewat kode." \
    --push
fi

echo "==> Bikin repo profil organisasi ($ORG/.github)"
if gh repo view "$ORG/.github" >/dev/null 2>&1; then
  echo "    sudah ada, dilewati"
else
  gh repo create "$ORG/.github" --public \
    --description "Halaman profil organisasi"
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q -b main
  mkdir -p "$tmp/profile"
  cp ../senja-org/profile/README.md "$tmp/profile/README.md" 2>/dev/null \
    || echo "# $ORG" > "$tmp/profile/README.md"
  git -C "$tmp" add -A
  git -C "$tmp" -c user.email=noreply@github.com -c user.name="$ORG" \
    commit -q -m "docs: halaman profil organisasi"
  git -C "$tmp" remote add origin "https://github.com/$ORG/.github.git"
  git -C "$tmp" push -q -u origin main
  rm -rf "$tmp"
fi

echo "==> Pasang label"
# Label bawaan GitHub kebanyakan tidak kepakai; yang penting di sini adalah
# `art-direction`, karena itu pintu masuk buat orang yang jago pixel art
# tapi tidak ngoding.
add_label() {
  gh label create "$1" --repo "$ORG/$REPO" --color "$2" --description "$3" --force >/dev/null
  echo "    $1"
}
add_label "good first issue"  "7057ff" "Cocok buat yang baru gabung"
add_label "art-direction"     "d876e3" "Ada yang jelek — ga perlu bisa ngoding buat lapor"
add_label "art-generator"     "c2e0c6" "Nulis atau benerin generator gambar"
add_label "world-building"    "0e8a16" "Peta, distrik, tata ruang, lore"
add_label "dialogue"          "fbca04" "Kolam kalimat NPC dan sistem ingatan"
add_label "audio"             "1d76db" "Musik generatif dan ambient"
add_label "multiplayer"       "5319e7" "Server room, sinkronisasi, papan komunitas"
add_label "performance"       "e99695" "Frame rate, ukuran atlas, VRAM"
add_label "conduct"           "b60205" "Laporan pelanggaran aturan sopan"

echo "==> Nyalain Discussions"
gh api -X PATCH "repos/$ORG/$REPO" -F has_discussions=true >/dev/null || \
  echo "    gagal (butuh scope admin) — nyalain manual di Settings"

echo
echo "Beres. Repo: https://github.com/$ORG/$REPO"
