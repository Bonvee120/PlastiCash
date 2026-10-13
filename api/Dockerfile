FROM python:3.12-slim

# WeasyPrint system libraries (Pango, HarfBuzz) and fonts, for the ESG PDF.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libharfbuzz-subset0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render's free plan has no pre-deploy step, so with RUN_MIGRATIONS=1 the schema is migrated when the container
# starts (one instance only). A failed migration stops the start instead of serving an old schema.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" = 1 ]; then alembic upgrade head || exit 1; fi; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
