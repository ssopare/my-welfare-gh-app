// Ops-only bootstrap for the first (or Nth) PlatformOperator — deliberately
// not an HTTP endpoint. See the schema comment on PlatformOperator for why:
// there's no "first admin" self-service problem to solve here, just server/
// deploy access. Run with:
//
//   npx ts-node -r tsconfig-paths/register scripts/create-platform-operator.ts <email> <password>
//
// Connects as app_runtime (APP_DATABASE_URL), same role the app itself
// uses — platform_operators has no RLS (see its schema comment), so this
// needs no tenant/system context, just an ordinary insert.
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/client';

const PASSWORD_SALT_ROUNDS = 12;

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error(
      'Usage: create-platform-operator.ts <email> <password>',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.APP_DATABASE_URL as string),
  });

  try {
    const existing = await prisma.platformOperator.findUnique({
      where: { email },
    });
    if (existing) {
      console.error(`A platform operator with email ${email} already exists.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const operator = await prisma.platformOperator.create({
      data: { email, passwordHash },
    });
    console.log(`Created platform operator ${operator.email} (${operator.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
