#!/bin/bash
# gcp-setup.sh — One-time GCP infrastructure setup for Crost
# Run ONCE from your local machine after installing gcloud CLI.
# Usage: chmod +x gcp-setup.sh && ./gcp-setup.sh

set -e

# ── Configuration ──────────────────────────────────────────────────────────────
PROJECT_ID="crost-app"           # Change if needed
REGION="us-central1"
DB_INSTANCE="crost-db"
DB_NAME="crost"
DB_USER="crost"
GCS_BUCKET="${PROJECT_ID}-storage"

echo "=== Crost GCP Setup ==="
echo "Project: $PROJECT_ID | Region: $REGION"

# ── 1. Set project ─────────────────────────────────────────────────────────────
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

# ── 2. Enable required APIs ────────────────────────────────────────────────────
echo "[1/8] Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  cloudscheduler.googleapis.com \
  --quiet

# ── 3. Create Cloud SQL (PostgreSQL 15) ────────────────────────────────────────
echo "[2/8] Creating Cloud SQL instance (this takes ~5 minutes)..."
gcloud sql instances create $DB_INSTANCE \
  --database-version=POSTGRES_15 \
  --region=$REGION \
  --tier=db-f1-micro \
  --storage-size=10GB \
  --storage-type=SSD \
  --backup-start-time=03:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=4 \
  --quiet 2>/dev/null || echo "  (instance already exists, skipping)"

echo "[3/8] Creating database and user..."
gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE --quiet 2>/dev/null || true

DB_PASSWORD=$(openssl rand -base64 24)
gcloud sql users create $DB_USER \
  --instance=$DB_INSTANCE \
  --password="$DB_PASSWORD" \
  --quiet 2>/dev/null || echo "  (user already exists)"

DB_HOST=$(gcloud sql instances describe $DB_INSTANCE --format='value(connectionName)')
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${DB_HOST}"
echo "  DATABASE_URL (Cloud SQL connector): saved to secrets"

# ── 4. Run schema migrations ───────────────────────────────────────────────────
echo "[4/8] Running schema migrations..."
echo "  → Import crost_all_migrations.sql to your Cloud SQL instance via:"
echo "     gcloud sql connect $DB_INSTANCE --user=$DB_USER --database=$DB_NAME"
echo "     Then run: \\i /path/to/crost_all_migrations.sql"
echo "  → Or use Cloud SQL Studio in the GCP Console"

# ── 5. Create GCS bucket ───────────────────────────────────────────────────────
echo "[5/8] Creating GCS storage bucket..."
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$GCS_BUCKET 2>/dev/null || echo "  (bucket exists)"
gsutil iam ch allUsers:objectViewer gs://$GCS_BUCKET

# ── 6. Store secrets in Secret Manager ────────────────────────────────────────
echo "[6/8] Storing secrets..."

store_secret() {
  local name=$1
  local value=$2
  echo -n "$value" | gcloud secrets create $name --data-file=- --quiet 2>/dev/null || \
  echo -n "$value" | gcloud secrets versions add $name --data-file=- --quiet
}

store_secret "DATABASE_URL" "$DATABASE_URL"
store_secret "GCS_BUCKET" "$GCS_BUCKET"
store_secret "GCP_PROJECT_ID" "$PROJECT_ID"

echo ""
echo "  ⚠ You need to manually store these secrets (run the store_secret commands):"
echo "     GOOGLE_AI_STUDIO_API_KEY  — from https://aistudio.google.com/apikey"
echo "     FIREBASE_PROJECT_ID       — from Firebase Console"
echo "     FIREBASE_CLIENT_EMAIL     — from Firebase service account JSON"
echo "     FIREBASE_PRIVATE_KEY      — from Firebase service account JSON"
echo "     NEXT_PUBLIC_FIREBASE_API_KEY"
echo "     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
echo "     NEXT_PUBLIC_FIREBASE_PROJECT_ID"
echo "     NEXT_PUBLIC_FIREBASE_APP_ID"
echo ""
echo "  Run: gcloud secrets create SECRET_NAME --data-file=- <<< 'value'"

# ── 7. Grant Cloud Run service account access ──────────────────────────────────
echo "[7/8] Granting permissions..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/cloudsql.client" --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor" --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/storage.objectAdmin" --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/aiplatform.user" --quiet

# ── 8. Create Cloud Scheduler for approval expiry ──────────────────────────────
echo "[8/8] Creating Cloud Scheduler job..."
gcloud scheduler jobs create http crost-approval-expiry \
  --schedule="0 * * * *" \
  --uri="https://crost-frontend-HASH-uc.a.run.app/api/cron/expire-approvals" \
  --message-body='{"secret":"REPLACE_WITH_CRON_SECRET"}' \
  --http-method=POST \
  --location=$REGION \
  --quiet 2>/dev/null || echo "  (update the URI after first deployment)"

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Store the remaining secrets listed above"
echo "  2. Export Supabase data: pg_dump postgres://... | gcloud sql connect $DB_INSTANCE ..."
echo "  3. Deploy: gcloud builds submit --config cloudbuild.yaml"
echo "  4. Update Cloud Scheduler URI with your Cloud Run URL"
echo ""
echo "  Supabase export command:"
echo "    pg_dump 'postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres' \\"
echo "      --no-owner --no-acl > crost_data.sql"
echo "    gcloud sql connect $DB_INSTANCE --user=$DB_USER --database=$DB_NAME < crost_data.sql"
