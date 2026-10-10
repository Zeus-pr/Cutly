import { PrismaClient } from '@prisma/client';
import { ensureDefaultShopHours } from '../backend/src/hours';
import { ensureStaffBarbers } from '../backend/src/staff';

const prisma = new PrismaClient();

async function main() {
  const haircut = await prisma.service.upsert({
    where: { id: 'seed-haircut' },
    update: {},
    create: { id: 'seed-haircut', name: 'Haircut', durationMinutes: 30 }
  });
  const shop = await prisma.shop.upsert({
    where: { id: 'seed-urban-cuts' },
    update: {},
    create: {
      id: 'seed-urban-cuts',
      name: 'Urban Cuts (DEV)',
      address: '44 GT Road',
      city: 'Burdwan',
      latitude: 23.2324,
      longitude: 87.8615,
      setupDone: true
    }
  });
  await prisma.shopService.upsert({
    where: { shopId_serviceId: { shopId: shop.id, serviceId: haircut.id } },
    update: { pricePaise: 35000, durationMinutes: 30, bufferMinutes: 10 },
    create: {
      shopId: shop.id,
      serviceId: haircut.id,
      pricePaise: 35000,
      durationMinutes: 30,
      bufferMinutes: 10
    }
  });
  await prisma.barber.upsert({
    where: { id: 'seed-rahul' },
    update: { name: 'Rahul' },
    create: { id: 'seed-rahul', shopId: shop.id, name: 'Rahul', rating: 4.8 }
  });
  await ensureStaffBarbers(prisma, shop.id, 2);
  await ensureDefaultShopHours(prisma, shop.id);
  console.log('Seeded clearly labelled CUTLY development data.');
}

main().finally(() => prisma.$disconnect());
