#!/usr/bin/env bash
# Deploy this static site to Heroku and attach a custom domain.
#
# Usage:
#   ./deploy-heroku.sh <heroku-app-name> [custom-domain]
#
# Examples:
#   ./deploy-heroku.sh team99-portfolio
#   ./deploy-heroku.sh team99-portfolio www.team99.tech
#
# Requirements:
#   - Heroku CLI installed (https://devcenter.heroku.com/articles/heroku-cli)
#   - Logged in: `heroku login`
#   - An Eco/Basic dyno plan on the app (Heroku has no free tier anymore) —
#     the CLI will prompt you to add a payment method if needed.

set -euo pipefail

APP_NAME="${1:?Usage: ./deploy-heroku.sh <heroku-app-name> [custom-domain]}"
CUSTOM_DOMAIN="${2:-}"

command -v heroku >/dev/null 2>&1 || {
  echo "Heroku CLI not found. Install it: https://devcenter.heroku.com/articles/heroku-cli"
  exit 1
}

heroku whoami >/dev/null 2>&1 || {
  echo "Not logged in to Heroku. Running 'heroku login'..."
  heroku login
}

# --- Git repo setup ---
if [ ! -d .git ]; then
  echo "Initializing git repository..."
  git init
  git branch -M main
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')"
else
  echo "No changes to commit."
fi

# --- Heroku app setup ---
if heroku apps:info -a "$APP_NAME" >/dev/null 2>&1; then
  echo "Using existing Heroku app: $APP_NAME"
else
  echo "Creating Heroku app: $APP_NAME"
  heroku create "$APP_NAME"
fi

if ! git remote get-url heroku >/dev/null 2>&1; then
  heroku git:remote -a "$APP_NAME"
fi

heroku buildpacks:set heroku-community/static -a "$APP_NAME"

# --- Deploy ---
echo "Pushing to Heroku..."
git push heroku main:main -f

# --- Custom domain ---
if [ -n "$CUSTOM_DOMAIN" ]; then
  echo "Adding custom domain: $CUSTOM_DOMAIN"
  heroku domains:add "$CUSTOM_DOMAIN" -a "$APP_NAME" || true
  echo
  echo "DNS setup required — point your domain to the target below at your registrar:"
  heroku domains -a "$APP_NAME"
  echo
  echo "  - Root domain (e.g. team99.tech): use an ALIAS/ANAME record to the DNS target"
  echo "  - Subdomain (e.g. www.team99.tech): use a CNAME record to the DNS target"
fi

heroku open -a "$APP_NAME"
