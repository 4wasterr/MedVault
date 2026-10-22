#!/usr/bin/env bash
# ====================================================================
# MedVault PostgreSQL Automated Setup for Linux Mint (21.x / 22.x)
# Tested on Linux Mint Cinnamon / Ubuntu 22.04 / 24.04 LTS
# ====================================================================
set -euo pipefail

DB_NAME="medvault"
DB_USER="medvault_user"
DB_PASS="${MEDVAULT_DB_PASSWORD:-medvault_secure_password_2026}"
DB_PORT="5432"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCHEMA_FILE="${PROJECT_ROOT}/frontend/server/sql/schema.sql"
ENV_FILE="${PROJECT_ROOT}/frontend/server/.env"

echo "=========================================================="
echo "    MedVault PostgreSQL Auto-Setup for Linux Mint"
echo "=========================================================="

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] Please run this script with sudo: sudo bash $0" >&2
   exit 1
fi

echo "[1/5] Installing PostgreSQL packages..."
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib libicu-dev openssl

echo "[2/5] Starting, configuring and enabling PostgreSQL service..."
systemctl enable postgresql
systemctl start postgresql

# Configure PostgreSQL to accept connections across VM network (Host-to-VM)
PG_CONF=$(find /etc/postgresql/ -name postgresql.conf 2>/dev/null | head -n 1 || true)
PG_HBA=$(find /etc/postgresql/ -name pg_hba.conf 2>/dev/null | head -n 1 || true)

if [[ -n "${PG_CONF}" && -f "${PG_CONF}" ]]; then
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" "${PG_CONF}"
    sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/g" "${PG_CONF}"
fi

if [[ -n "${PG_HBA}" && -f "${PG_HBA}" ]]; then
    if ! grep -q "0.0.0.0/0" "${PG_HBA}"; then
        echo "host    all             all             0.0.0.0/0               md5" >> "${PG_HBA}"
    fi
fi

systemctl restart postgresql

echo "[3/5] Setting up PostgreSQL database user and database..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
            CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
            RAISE NOTICE 'Role % created', '${DB_USER}';
        ELSE
            ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
            RAISE NOTICE 'Role % password updated', '${DB_USER}';
        END IF;
    END
    \$\$;

    SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

    GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOSQL

echo "[4/5] Applying MedVault Schema DDL (${SCHEMA_FILE})..."
if [[ -f "${SCHEMA_FILE}" ]]; then
    PGPASSWORD="${DB_PASS}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -f "${SCHEMA_FILE}"
    echo "Schema applied successfully!"
else
    echo "[WARNING] Schema file not found at ${SCHEMA_FILE}."
fi

echo "[5/5] Granting public schema permissions..."
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<-EOSQL
    GRANT ALL ON SCHEMA public TO ${DB_USER};
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
EOSQL

CONNECTION_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}"
VM_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_VM_IP")
REMOTE_CONNECTION_URL="postgresql://${DB_USER}:${DB_PASS}@${VM_IP}:${DB_PORT}/${DB_NAME}"

echo ""
echo "=========================================================="
echo " PostgreSQL Setup Completed Successfully on Linux Mint!"
echo "=========================================================="
echo " Database Name:  ${DB_NAME}"
echo " Database User:  ${DB_USER}"
echo " Database Pass:  ${DB_PASS}"
echo " Port:           ${DB_PORT}"
echo " Linux Mint IP:  ${VM_IP}"
echo ""
echo " 1) If running MedVault INSIDE this Linux Mint VM:"
echo "    DATABASE_URL=${CONNECTION_URL}"
echo ""
echo " 2) If running MedVault on your HOST (Windows) machine:"
echo "    DATABASE_URL=${REMOTE_CONNECTION_URL}"
echo "=========================================================="
echo ""

# Write or update .env if desired
if [[ ! -f "${ENV_FILE}" ]]; then
    cat <<EOF > "${ENV_FILE}"
DATABASE_URL=${CONNECTION_URL}
PGHOST=localhost
PGPORT=${DB_PORT}
PGDATABASE=${DB_NAME}
PGUSER=${DB_USER}
PGPASSWORD=${DB_PASS}
EOF
    echo "Wrote PostgreSQL configuration to ${ENV_FILE}"
else
    echo "To connect MedVault, ensure your ${ENV_FILE} contains:"
    echo "DATABASE_URL=${CONNECTION_URL}"
fi

echo ""
echo "To test the connection now, run:"
echo "  node ${PROJECT_ROOT}/scripts/test-postgres-connection.cjs"
echo "=========================================================="

