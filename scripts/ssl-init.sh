#!/bin/bash
# scripts/ssl-init.sh
# One-time Let's Encrypt SSL setup for abhitrade.com
# Run this ONCE on first deploy on your server.
# After this, certbot auto-renews every 12h via the certbot container.
#
# Usage:
#   bash scripts/ssl-init.sh                          # production build
#   bash scripts/ssl-init.sh docker-compose.hub.yml   # hub image pull

set -e

DOMAIN="abhitrade.com"
EMAIL="abhishekdevopstech@gmail.com"
COMPOSE_FILE="${1:-docker-compose.yml}"

CERT_DIR="./certbot/conf/live/$DOMAIN"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  TradeKaro — Let's Encrypt SSL Setup"
echo "  Domain : $DOMAIN"
echo "  Email  : $EMAIL"
echo "══════════════════════════════════════════════════════"
echo ""

# ── Step 1: Create dummy self-signed cert so nginx can start ─────────────────
# nginx refuses to start if ssl_certificate path doesn't exist.
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "[1/5] Generating temporary self-signed certificate..."
  mkdir -p "$CERT_DIR"
  docker run --rm \
    -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
    --entrypoint openssl \
    certbot/certbot \
    req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
    -out    "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
    -subj   "/CN=$DOMAIN"
  # chain.pem needs to exist too (nginx ssl_trusted_certificate)
  cp "$CERT_DIR/fullchain.pem" "$CERT_DIR/chain.pem"
else
  echo "[1/5] Certificate already exists — skipping dummy cert creation."
fi

# ── Step 2: Start nginx (with dummy cert so it can serve ACME challenge) ─────
echo "[2/5] Starting nginx..."
docker-compose -f "$COMPOSE_FILE" up -d nginx
echo "      Waiting 5s for nginx to be ready..."
sleep 5

# ── Step 3: Verify port 80 is reachable (DNS must point to this server) ──────
echo "[3/5] Testing HTTP reachability at http://$DOMAIN ..."
if ! curl -s --max-time 10 "http://$DOMAIN/.well-known/acme-challenge/test" > /dev/null 2>&1; then
  echo ""
  echo "  WARNING: http://$DOMAIN is not reachable."
  echo "  Make sure your DNS A record for $DOMAIN points to this server's IP"
  echo "  and port 80 is open in your firewall before continuing."
  echo ""
  read -rp "  Continue anyway? (y/N): " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# ── Step 4: Get real Let's Encrypt certificate ────────────────────────────────
echo "[4/5] Requesting Let's Encrypt certificate (webroot method)..."
docker-compose -f "$COMPOSE_FILE" run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

# ── Step 5: Restart nginx so it re-runs the startup command with the real cert ─
echo "[5/5] Restarting nginx to activate HTTPS..."
docker-compose -f "$COMPOSE_FILE" restart nginx

echo ""
echo "══════════════════════════════════════════════════════"
echo "  SSL setup complete!"
echo "  Your site is live at: https://$DOMAIN"
echo "  Auto-renewal runs every 12h via the certbot container."
echo "══════════════════════════════════════════════════════"
echo ""
