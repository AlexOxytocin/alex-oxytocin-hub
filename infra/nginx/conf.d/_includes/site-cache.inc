# Included inside the locale-first godmodetools.com server block.
# Astro owns every file name under /_astro/, so those assets are content hashed.
location ^~ /_astro/ {
    include /etc/nginx/conf.d/_includes/security-headers.inc;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    access_log off;
    try_files $uri =404;
}

# Route HTML must revalidate on every release. This location also prevents the
# SPA-style soft-404 fallback used by the legacy sites.
location / {
    include /etc/nginx/conf.d/_includes/security-headers.inc;
    add_header Cache-Control "no-cache" always;
    try_files $uri $uri/ $uri/index.html =404;
}

location ~* \.(?:html)$ {
    include /etc/nginx/conf.d/_includes/security-headers.inc;
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
}

# These names are stable rather than fingerprinted; keep their cache bounded.
location ~* ^/(?:favicon\.(?:svg|png)|(?:ru|en)/experience(?:/java)?/downloads/.*)$ {
    include /etc/nginx/conf.d/_includes/security-headers.inc;
    add_header Cache-Control "public, max-age=86400" always;
    try_files $uri =404;
}
