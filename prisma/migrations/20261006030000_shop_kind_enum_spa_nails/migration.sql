-- Enum values must be committed before use (PG + Prisma transaction).
ALTER TYPE "ShopKind" ADD VALUE IF NOT EXISTS 'SPA';
ALTER TYPE "ShopKind" ADD VALUE IF NOT EXISTS 'NAILS';
