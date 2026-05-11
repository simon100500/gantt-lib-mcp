# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

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

# Production stage
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config if needed
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
