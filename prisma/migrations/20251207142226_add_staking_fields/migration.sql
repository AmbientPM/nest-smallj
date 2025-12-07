-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "main_token_holders" JSONB;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "rewards" JSONB DEFAULT '[]';
