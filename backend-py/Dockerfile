# CASTmir — single-container deploy: FastAPI + DuckDB + Bedrock COACH proxy,
# serving the built React frontend as static files (same pattern the
# original Node app used).
FROM public.ecr.aws/docker/library/node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/index.html frontend/vite.config.js ./
COPY frontend/src ./src
COPY frontend/public ./public
# The Landing page's #install section serves this zip directly — it must
# always match the extension/ source in THIS SAME build, not a manually
# regenerated snapshot someone forgot to update (that's exactly how it went
# stale before: missing vendor/browser-polyfill.js entirely, and still
# carrying since-removed UI, for days before anyone noticed). Regenerating
# it here, every build, from the actual source being shipped makes that
# class of drift structurally impossible instead of just fixed once.
# Flat structure (zip run from inside extension/, not `zip -r .. extension`)
# matches what Windows' native "Extract All" produces when a zip has no
# internal top-level folder — see Landing.jsx's install instructions.
COPY extension ./extension-src
RUN apk add --no-cache zip \
    && cd extension-src && zip -rq ../public/castmir-extension.zip . && cd ..
ENV VITE_API_URL=SAME_ORIGIN
RUN npm run build

FROM public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app

COPY backend-py/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend-py/ .
COPY --from=frontend-build /app/dist ./public

ENV PORT=8080
EXPOSE 8080
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
