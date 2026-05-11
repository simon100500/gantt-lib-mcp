# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files from packages/site
COPY ../../packages/site/package.json ../../packages/site/package-lock.json* ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source files from packages/site
COPY ../../packages/site . .

ARG PUBLIC_SITE_PUBLICATIONS_API_BASE_URL
ARG SITE_PUBLICATIONS_API_BASE_URL
ARG PUBLIC_SITE_URL
ARG SITE_URL
ARG PUBLIC_APP_URL

ENV PUBLIC_SITE_PUBLICATIONS_API_BASE_URL=${PUBLIC_SITE_PUBLICATIONS_API_BASE_URL}
ENV SITE_PUBLICATIONS_API_BASE_URL=${SITE_PUBLICATIONS_API_BASE_URL}
ENV PUBLIC_SITE_URL=${PUBLIC_SITE_URL}
ENV SITE_URL=${SITE_URL}
ENV PUBLIC_APP_URL=${PUBLIC_APP_URL}

RUN echo "PUBLIC_SITE_PUBLICATIONS_API_BASE_URL=${PUBLIC_SITE_PUBLICATIONS_API_BASE_URL}" \
  && echo "SITE_PUBLICATIONS_API_BASE_URL=${SITE_PUBLICATIONS_API_BASE_URL}" \
  && echo "PUBLIC_SITE_URL=${PUBLIC_SITE_URL}" \
  && echo "PUBLIC_APP_URL=${PUBLIC_APP_URL}"

# Build the site
RUN npm run build


# ── Production stage (nginx) ────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copy built files from builder
COPY --from=builder /build/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
