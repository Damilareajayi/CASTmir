# CASTMIR — single-container deploy (frontend + API + COACH Bedrock proxy)

FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
ENV VITE_API_URL=SAME_ORIGIN
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/aggregate.js backend/constants.js backend/db.js backend/scoring.js backend/server.js ./
COPY backend/sources ./sources
COPY backend/data/castmir.db ./data/castmir.db
COPY --from=frontend-build /app/dist ./public

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
