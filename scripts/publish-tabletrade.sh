#!/usr/bin/env bash
# Create msumegi/tabletrade from scripts/tabletrade-seed and turn on GitHub Pages.
# Run this with *your* GitHub login (gh auth login), not the Cursor repo-scoped app token.
set -euo pipefail

OWNER="${TABLETRADE_OWNER:-msumegi}"
REPO="${TABLETRADE_REPO:-tabletrade}"
FULL="$OWNER/$REPO"
SEED="$(cd "$(dirname "$0")/tabletrade-seed" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ ! -f "$SEED/index.html" || ! -f "$SEED/styles.css" ]]; then
  echo "Missing seed files in $SEED" >&2
  exit 1
fi

if ! gh repo view "$FULL" >/dev/null 2>&1; then
  echo "Creating public repo $FULL …"
  if ! gh repo create "$FULL" --public --description "TableTrade marketing site"; then
    echo >&2
    echo "Could not create $FULL. The Cursor GitHub App is installed only on msumegi/tableping," >&2
    echo "so this step needs your personal gh session." >&2
    echo >&2
    echo "  gh auth login" >&2
    echo "  gh repo create $FULL --public --description \"TableTrade marketing site\"" >&2
    echo "  $0" >&2
    echo >&2
    echo "Or in the GitHub UI: New repository → $FULL → Public → Create (no README)," >&2
    echo "then run this script again." >&2
    exit 1
  fi
else
  echo "Repo $FULL already exists — will push marketing site to main."
fi

cp -a "$SEED"/. "$WORK"/
rm -rf "$WORK/.git"
git -C "$WORK" init -b main
git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
  echo "Seed is empty — aborting." >&2
  exit 1
fi
git -C "$WORK" \
  -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  -c user.name="tabletrade-seed" \
  commit -m "Add TableTrade marketing site at repo root."
git -C "$WORK" remote add origin "https://github.com/$FULL.git"
git -C "$WORK" push -u origin main

if gh api "repos/$FULL/pages" >/dev/null 2>&1; then
  echo "GitHub Pages is already configured on $FULL."
else
  echo "Enabling GitHub Pages (Actions) on $FULL …"
  if ! gh api --method POST "repos/$FULL/pages" -f build_type=workflow; then
    echo "Pages API create failed — trying branch source main / …" >&2
    gh api --method POST "repos/$FULL/pages" \
      -f source[branch]=main \
      -f source[path]=/ || true
  fi
fi

echo
echo "Repo:     https://github.com/$FULL"
echo "Site:     https://${OWNER}.github.io/${REPO}/"
echo "App (unchanged): https://${OWNER}.github.io/tableping/"
echo
echo "If the marketing URL 404s, open https://github.com/$FULL/settings/pages"
echo "and set Source to GitHub Actions (or Deploy from a branch → main → / root)."
echo "Then wait for the Deploy GitHub Pages workflow, or: gh workflow run pages.yml --repo $FULL"
