# 本番用のイメージ（1つのコンテナで Rails API と画面の静的ファイルを配る）。
# 1. 画面（React + Phaser）を Vite でビルドする
# 2. Rails の本番用 gem だけを入れる
# 3. ビルドした画面を Rails の public/ に置き、同じオリジンで /api と画面を配る（CORS を使わない）
# 開発・テスト用は backend/Dockerfile.dev（Docker Compose）。
# 素材（frontend/public/art）は権利条件が未確認のため、.dockerignore でイメージに入れない（README・copy-art.mjs を参照）。

FROM node:26.5.0-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# 見本ページなど一部の画面は、街の地図（backend/config/towns）を直接読み込む
COPY backend/config/towns/ /app/backend/config/towns/
RUN npm run build

FROM ruby:3.4.10-slim AS gems
RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends build-essential libpq-dev libyaml-dev \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV BUNDLE_DEPLOYMENT=1 BUNDLE_WITHOUT="development:test" BUNDLE_PATH=/usr/local/bundle
COPY backend/Gemfile backend/Gemfile.lock ./
RUN bundle install && rm -rf "${BUNDLE_PATH}"/ruby/*/cache

FROM ruby:3.4.10-slim
RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends libpq5 libyaml-0-2 curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV RAILS_ENV=production BUNDLE_DEPLOYMENT=1 BUNDLE_WITHOUT="development:test" BUNDLE_PATH=/usr/local/bundle \
    RAILS_LOG_TO_STDOUT=1
COPY --from=gems /usr/local/bundle /usr/local/bundle
COPY backend/ ./
COPY --from=frontend /app/frontend/dist/ ./public/
RUN useradd --create-home --shell /bin/bash rails \
  && mkdir -p log tmp storage && chown -R rails:rails log tmp storage
USER rails
EXPOSE 3000
# 起動のたびに未適用のマイグレーションを当ててから起動する（db:prepare は DB が無ければ作る）
CMD ["sh", "-c", "bin/rails db:prepare && exec bin/rails server -b 0.0.0.0 -p ${PORT:-3000}"]
