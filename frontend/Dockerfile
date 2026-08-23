# Frontend Dockerfile for Next.js 16 + Razorpay Blade
FROM node:20-alpine AS builder

WORKDIR /app

# NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time —
# passing them as runtime env to the container does nothing. The value must be
# reachable from the USER'S BROWSER (not from inside the compose network), so
# the default is localhost, where docker-compose maps the backend port.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Install dependencies (.npmrc carries legacy-peer-deps for Blade's
# react-native peer chain — npm ci fails without it)
COPY package*.json .npmrc ./
RUN npm ci

# Copy source
COPY . .

# Build application
RUN npm run build

# Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json /app/.npmrc ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "run", "start"]
