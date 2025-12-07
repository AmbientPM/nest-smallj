-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "telegram_username" TEXT,
    "telegram_name" TEXT NOT NULL,
    "xlm_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "public_key" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "deposit_address" TEXT,
    "deposit_amount" DOUBLE PRECISION,
    "issuer_public" TEXT,
    "issuer_secret" TEXT,
    "sending_enabled" BOOLEAN NOT NULL DEFAULT false,
    "xrp_deposit_address" TEXT,
    "xrp_nwo_price" DOUBLE PRECISION,
    "purchase_distributor_public" TEXT,
    "purchase_distributor_secret" TEXT,
    "rewards_tier" JSONB,
    "swap_tier" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staking_assets" (
    "id" SERIAL NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_issuer" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "tier" JSONB NOT NULL,
    "premium" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staking_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributors" (
    "id" SERIAL NOT NULL,
    "public_key" TEXT NOT NULL,
    "secret_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "adding_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidity" (
    "id" SERIAL NOT NULL,
    "milestone" DOUBLE PRECISION NOT NULL,
    "start_amount" DOUBLE PRECISION NOT NULL,
    "adding_amount" DOUBLE PRECISION NOT NULL,
    "end_amount" DOUBLE PRECISION NOT NULL,
    "distributor_public" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "username" TEXT,
    "full_name" TEXT,
    "action_type" TEXT NOT NULL,
    "action_data" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_public_key_key" ON "wallets"("public_key");

-- CreateIndex
CREATE UNIQUE INDEX "staking_assets_asset_code_asset_issuer_key" ON "staking_assets"("asset_code", "asset_issuer");

-- CreateIndex
CREATE UNIQUE INDEX "distributors_public_key_key" ON "distributors"("public_key");

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
