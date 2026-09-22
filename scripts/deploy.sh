#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

APP_PORT="${APP_PORT:-80}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://localhost:${APP_PORT}}"
ENV_FILE="$PROJECT_DIR/.env"
SECRETS_DIR="$PROJECT_DIR/secrets"
DATABASE_CONTAINER="${DATABASE_CONTAINER:-my-mysql}"
BACKEND_NETWORK="${BACKEND_NETWORK:-impact-flow-backend}"

command -v docker >/dev/null 2>&1 || { echo "错误: 未安装 Docker" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "错误: 未安装 Docker Compose" >&2; exit 1; }
docker inspect "$DATABASE_CONTAINER" >/dev/null 2>&1 || {
  echo "错误: 数据库容器不存在: $DATABASE_CONTAINER" >&2
  exit 1
}
docker network inspect "$BACKEND_NETWORK" >/dev/null 2>&1 || docker network create "$BACKEND_NETWORK" >/dev/null
if ! docker inspect --format '{{json .NetworkSettings.Networks}}' "$DATABASE_CONTAINER" | grep -q "\"$BACKEND_NETWORK\""; then
  docker network connect "$BACKEND_NETWORK" "$DATABASE_CONTAINER"
fi

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

if [[ ! -s "$SECRETS_DIR/mysql_password" ]]; then
  generate_secret > "$SECRETS_DIR/mysql_password"
fi
if [[ ! -s "$SECRETS_DIR/mysql_root_password" ]]; then
  generate_secret > "$SECRETS_DIR/mysql_root_password"
fi
chmod 600 "$SECRETS_DIR/mysql_password" "$SECRETS_DIR/mysql_root_password"

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  AI_CONFIG_ENCRYPTION_KEY="$(generate_secret)"
  umask 077
  cat > "$ENV_FILE" <<EOF
MYSQL_DATABASE=impact_flow
MYSQL_USER=impact_flow
AI_CONFIG_ENCRYPTION_KEY=$AI_CONFIG_ENCRYPTION_KEY
EOF
  echo "已创建 $ENV_FILE"
fi

set_env_value APP_PORT "$APP_PORT"
set_env_value WEB_ORIGIN "$PUBLIC_ORIGIN"
set_env_value COOKIE_SECURE "false"

if ! grep -q '^AI_CONFIG_ENCRYPTION_KEY=..' "$ENV_FILE"; then
  set_env_value AI_CONFIG_ENCRYPTION_KEY "$(generate_secret)"
fi
chmod 600 "$ENV_FILE"

docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps

echo "等待服务健康检查..."
for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null; then
    echo "部署成功: $PUBLIC_ORIGIN"
    exit 0
  fi
  sleep 2
done

echo "错误: 服务未能在预期时间内通过健康检查" >&2
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps >&2
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml logs --tail=100 >&2
exit 1
