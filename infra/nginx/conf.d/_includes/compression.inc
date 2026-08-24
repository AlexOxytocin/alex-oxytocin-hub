# Included once in the Nginx http context. The nested `.inc` suffix matters:
# production loads only `/etc/nginx/conf.d/*.conf`, so this file is never
# parsed as a standalone top-level configuration.
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_proxied any;
gzip_types
    application/javascript
    application/json
    application/manifest+json
    application/xml
    image/svg+xml
    text/css
    text/plain
    text/xml;
