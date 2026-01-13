#!/bin/bash
# Configure nginx for Notorious DAD on Hetzner
# Run this ON the Hetzner server after initial setup

set -e

echo "🔧 Configuring nginx..."

# Create nginx configuration
cat > /etc/nginx/sites-available/notorious-dad << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name mixmaster.mixtape.run;

    # Redirect HTTP to HTTPS (will be enabled after SSL setup)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for mix generation (20 minutes)
        proxy_connect_timeout 1200s;
        proxy_send_timeout 1200s;
        proxy_read_timeout 1200s;
    }

    # Increase max body size for file uploads
    client_max_body_size 50M;
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/notorious-dad /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t

# Restart nginx
systemctl restart nginx
systemctl enable nginx

echo "✅ nginx configured successfully!"
echo ""
echo "Next: Set up SSL with certbot --nginx -d mixmaster.mixtape.run"
