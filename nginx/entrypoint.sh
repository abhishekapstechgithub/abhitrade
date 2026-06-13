#!/bin/sh
# nginx startup — enables HTTPS + HTTP→HTTPS redirect when cert exists,
# falls back to HTTP-only proxy when cert is absent (before ssl-init.sh runs).
set -e

CERT="/etc/letsencrypt/live/abhitrade.com/fullchain.pem"

if [ -f "$CERT" ]; then
  echo "[nginx] SSL cert found — enabling HTTPS + HTTP→HTTPS redirect"

  # Activate HTTPS server block
  cp /etc/nginx/https.conf.template /etc/nginx/conf.d/https.conf

  # Switch HTTP block to redirect (keeps ACME challenge working for renewals)
  cat > /etc/nginx/conf.d/http.conf << 'NGINXEOF'
server {
    listen 80;
    server_name abhitrade.com www.abhitrade.com;

    # Let's Encrypt renewal challenge — must stay on port 80
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    # Redirect all other HTTP → HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
NGINXEOF

else
  echo "[nginx] No SSL cert — starting in HTTP-only proxy mode"
  echo "        Run:  bash scripts/ssl-init.sh  to obtain the certificate"
  cp /etc/nginx/http.conf.template /etc/nginx/conf.d/http.conf
fi

exec nginx -g 'daemon off;'
