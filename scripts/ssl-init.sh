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
RENEWAL_CONF="./certbot/conf/renewal/$DOMAIN.conf"

# ── Detect docker compose command (v2 plugin vs v1 standalone) ───────────────
if docker compose version > /dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "  TradeKaro — Let's Encrypt SSL Setup"
echo "  Domain : $DOMAIN"
echo "  Email  : $EMAIL"
echo "  Compose: $DC"
echo "══════════════════════════════════════════════════════"
echo ""

# ── Step 1: Create dummy self-signed cert so nginx can start ─────────────────
# nginx refuses to start if ssl_certificate path doesn't exist.
# We always recreate the dummy cert here — the real cert (from certbot) will
# replace it in step 4. If a real certbot cert already exists, this step is
# still safe because we wipe it in step 3b before asking certbot.
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

# ── Step 2: Start nginx (with dummy cert so it can serve ACME challenge) ─────
echo "[2/5] Starting nginx..."
$DC -f "$COMPOSE_FILE" up -d nginx
echo "      Waiting 5s for nginx to be ready..."
sleep 5

# ── Step 3: Verify port 80 is reachable (DNS must point to this server) ──────
echo "[3/5] Testing HTTP reachability at http://$DOMAIN ..."
if ! curl -s --max-time 10 "http://$DOMAIN/.well-known/acme-challenge/test" > /dev/null 2>&1; then
  echo ""
  echo "  WARNING: http://$DOMAIN is not reachable."
  echo "  Make sure:"
  echo "    1. DNS A record for $DOMAIN points to this server's IP"
  echo "    2. Port 80 is open in your firewall/security group"
  echo "    3. No other process is on port 80"
  echo ""
  read -rp "  Continue anyway? (y/N): " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# ── Step 3b: Remove dummy cert so certbot can create a proper one ────────────
# The dummy cert was created with raw openssl — certbot has no renewal metadata
# for it and will error "live directory exists". Nginx is already running and
# has the cert loaded in memory, so deleting the files on disk is safe here.
echo "      Clearing dummy cert before requesting real certificate..."
rm -rf "$CERT_DIR"
rm -f  "$RENEWAL_CONF"

# ── Step 4: Get real Let's Encrypt certificate ────────────────────────────────
echo "[4/5] Requesting Let's Encrypt certificate (webroot method)..."
echo "      This may take up to 60 seconds..."
$DC -f "$COMPOSE_FILE" run --rm --entrypoint certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

# ── Step 5: Restart nginx so it loads the real Let's Encrypt cert ─────────────
echo "[5/5] Restarting nginx to activate HTTPS..."
$DC -f "$COMPOSE_FILE" restart nginx

echo ""
echo "══════════════════════════════════════════════════════"
echo "  SSL setup complete!"
echo "  Your site is live at: https://$DOMAIN"
echo "  Auto-renewal runs every 12h via the certbot container."
echo "══════════════════════════════════════════════════════"
echo ""
