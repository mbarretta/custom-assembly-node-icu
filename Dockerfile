# ============================================================================
# Chainguard Custom Assembly Demo — Dockerfile
#
# Parameterized so you can point at the stock image (to see the problem)
# or a Custom Assembly image with icu-dev (to see the fix).
#
# Usage:
#   Stock image (dev artifacts missing — probe shows failures):
#     docker build --build-arg NODE_IMAGE=cgr.dev/chainguard/node -t icu-demo .
#
#   CA image with icu-dev (all checks pass):
#     docker build --build-arg NODE_IMAGE=cgr.dev/<ORG>/custom-node-icu -t icu-demo .
#
#   Then run:
#     docker run --rm icu-demo
# ============================================================================

ARG NODE_IMAGE=cgr.dev/chainguard/node:latest

FROM ${NODE_IMAGE}

WORKDIR /app

COPY app/package.json ./
COPY app/index.js ./

CMD ["index.js"]
