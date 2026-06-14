#!/bin/sh
# nginx startup — enables HTTPS + HTTP→HTTPS redirect when cert exists,
# falls back to HTTP-only proxy when cert is absent (before ssl-init.sh runs).
set -e

CERT_COM="/etc/letsencrypt/live/abhitrade.com/fullchain.pem"
CERT_ONLINE="/etc/letsencrypt/live/abhitrade.online/fullchain.pem"

if [ -f "$CERT_COM" ]; then
  echo "[nginx] SSL cert found — enabling HTTPS + HTTP→HTTPS redirect"

  # Activate main HTTPS server block for abhitrade.com
  cp /etc/nginx/https.conf.template /etc/nginx/conf.d/https.conf

  # If abhitrade.online cert also exists, append an HTTPS redirect block for it.
  # On fresh servers without this cert, skip it to avoid a startup crash.
  if [ -f "$CERT_ONLINE" ]; then
    echo "[nginx] abhitrade.online cert found — adding HTTPS redirect block"
    cat >> /etc/nginx/conf.d/https.conf << 'ONLINEOF'

# abhitrade.online → abhitrade.com HTTPS redirect
server {
    listen 443 ssl;
    server_name abhitrade.online www.abhitrade.online;
    ssl_certificate     /etc/letsencrypt/live/abhitrade.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/abhitrade.online/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL_OLD:1m;
    return 301 https://abhitrade.com$request_uri;
}
ONLINEOF
  fi

  # HTTP block: upstream + ACME challenge for both domains + redirect to HTTPS
  cat > /etc/nginx/conf.d/http.conf << 'NGINXEOF'
upstream tradekaro_app {
    server app:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name abhitrade.com www.abhitrade.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    location / {
        return 301 https://abhitrade.com$request_uri;
    }
}

server {
    listen 80;
    server_name abhitrade.online www.abhitrade.online;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    location / {
        return 301 https://abhitrade.com$request_uri;
    }
}
NGINXEOF

else
  echo "[nginx] No SSL cert — starting in HTTP-only proxy mode"
  echo "        Run:  bash scripts/ssl-init.sh  to obtain the certificate"
  cp /etc/nginx/http.conf.template /etc/nginx/conf.d/http.conf
fi

exec nginx -g 'daemon off;'
