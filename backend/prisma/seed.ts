import { PrismaClient, PlatformRole, RestaurantRole, SubscriptionStatus, TableStatus, ItemAvailability, TaxCalculationType } from '@prisma/client';
import argon2 from 'argon2';
import { hashQrToken } from '../src/utils/token.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting ServeQR database seeding...');

  // 1. Password hash for all demo accounts
  const passwordHash = await argon2.hash('serveqr2026');

  // 2. Subscription Plans
  const basicPlan = await prisma.subscriptionPlan.upsert({
    where: { code: 'BASIC' },
    update: {},
    create: {
      name: 'Basic',
      code: 'BASIC',
      price: 1999.00,
      billingPeriod: 'MONTHLY',
      featureConfig: {
        maxTables: 10,
        kdsAccess: true,
        analytics: 'basic',
        customBranding: false,
      },
    },
  });

  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { code: 'PROFESSIONAL' },
    update: {},
    create: {
      name: 'Professional',
      code: 'PROFESSIONAL',
      price: 4499.00,
      billingPeriod: 'MONTHLY',
      featureConfig: {
        maxTables: 30,
        kdsAccess: true,
        analytics: 'advanced',
        customBranding: true,
      },
    },
  });

  const enterprisePlan = await prisma.subscriptionPlan.upsert({
    where: { code: 'ENTERPRISE' },
    update: {},
    create: {
      name: 'Enterprise',
      code: 'ENTERPRISE',
      price: 8999.00,
      billingPeriod: 'MONTHLY',
      featureConfig: {
        maxTables: 100,
        kdsAccess: true,
        analytics: 'comprehensive',
        customBranding: true,
        multiBranch: true,
      },
    },
  });

  console.log('✓ Subscription plans seeded.');

  // 3. Super Admin User
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@serveqr.io' },
    update: {},
    create: {
      email: 'admin@serveqr.io',
      passwordHash,
      displayName: 'Platform Admin',
      platformRole: PlatformRole.SUPER_ADMIN,
    },
  });

  console.log(`✓ Super Admin created (${superAdmin.email}).`);

  const now = new Date();
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(now.getFullYear() + 1);

  // 4. ABC Restaurant (Tenant + Restaurant + Memberships)
  const existingAbc = await prisma.restaurant.findUnique({
    where: { slug: 'abc-restaurant' },
  });

  if (!existingAbc) {
  const abcTenant = await prisma.tenant.create({
    data: {
      name: 'ABC Hospitality Group',
    },
  });

  const abcRestaurant = await prisma.restaurant.create({
    data: {
      tenantId: abcTenant.id,
      name: 'ABC Restaurant',
      slug: 'abc-restaurant',
      logoUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=160&auto=format&fit=crop&q=80',
      payAtRestaurantEnabled: true,
    },
  });

  // ABC Restaurant Subscription (Professional)
  await prisma.restaurantSubscription.create({
    data: {
      restaurantId: abcRestaurant.id,
      planId: proPlan.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: now,
      endsAt: oneYearFromNow,
      providerReference: 'SUB_ABC_PRO_01',
    },
  });

  // ABC Owner & Kitchen Staff
  const rahulOwner = await prisma.user.upsert({
    where: { email: 'rahul@abcrestaurant.in' },
    update: {},
    create: {
      email: 'rahul@abcrestaurant.in',
      passwordHash,
      displayName: 'Rahul Sharma',
      platformRole: PlatformRole.RESTAURANT_USER,
    },
  });

  const kitchenStaff = await prisma.user.upsert({
    where: { email: 'kitchen@abcrestaurant.in' },
    update: {},
    create: {
      email: 'kitchen@abcrestaurant.in',
      passwordHash,
      displayName: 'Kitchen Display Staff',
      platformRole: PlatformRole.RESTAURANT_USER,
    },
  });

  await prisma.restaurantMembership.createMany({
    data: [
      {
        restaurantId: abcRestaurant.id,
        userId: rahulOwner.id,
        role: RestaurantRole.OWNER,
      },
      {
        restaurantId: abcRestaurant.id,
        userId: kitchenStaff.id,
        role: RestaurantRole.KITCHEN,
      },
    ],
  });

  // ABC Branches
  const mainBranch = await prisma.branch.create({
    data: {
      restaurantId: abcRestaurant.id,
      name: 'Main Branch – Bengaluru',
      addressLine1: '42, 100 Feet Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    },
  });

  // Tables & QR Tokens for ABC Main Branch (T01 - T06)
  const tableCodes = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'];
  for (const code of tableCodes) {
    const table = await prisma.diningTable.create({
      data: {
        branchId: mainBranch.id,
        tableCode: code,
        displayName: `Table ${code}`,
        capacity: 4,
        status: TableStatus.ACTIVE,
      },
    });

    const rawQrSecret = `SERVEQR_${abcRestaurant.slug}_${mainBranch.id}_${code}_SECRET_KEY`;
    await prisma.qRToken.create({
      data: {
        diningTableId: table.id,
        tokenHash: hashQrToken(rawQrSecret),
        status: 'ACTIVE',
      },
    });
  }

  // Tax Rules for ABC Restaurant (GST: 2.5% CGST + 2.5% SGST = 5%)
  await prisma.taxRule.createMany({
    data: [
      {
        restaurantId: abcRestaurant.id,
        branchId: mainBranch.id,
        name: 'CGST',
        rate: 2.50,
        calculationType: TaxCalculationType.PERCENTAGE,
        isActive: true,
      },
      {
        restaurantId: abcRestaurant.id,
        branchId: mainBranch.id,
        name: 'SGST',
        rate: 2.50,
        calculationType: TaxCalculationType.PERCENTAGE,
        isActive: true,
      },
    ],
  });

  // Menu Categories
  const catBiryani = await prisma.menuCategory.create({
    data: {
      restaurantId: abcRestaurant.id,
      branchId: mainBranch.id,
      name: 'Biryani & Rice',
      sortOrder: 1,
    },
  });

  const catStarters = await prisma.menuCategory.create({
    data: {
      restaurantId: abcRestaurant.id,
      branchId: mainBranch.id,
      name: 'Starters',
      sortOrder: 2,
    },
  });

  const catBeverages = await prisma.menuCategory.create({
    data: {
      restaurantId: abcRestaurant.id,
      branchId: mainBranch.id,
      name: 'Beverages',
      sortOrder: 3,
    },
  });

  // Modifier Groups
  const spiceLevelGroup = await prisma.modifierGroup.create({
    data: {
      restaurantId: abcRestaurant.id,
      name: 'Spice Level',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: {
        create: [
          { name: 'Mild', priceDelta: 0.00, sortOrder: 1 },
          { name: 'Medium Spice', priceDelta: 0.00, sortOrder: 2 },
          { name: 'Extra Spicy', priceDelta: 10.00, sortOrder: 3 },
        ],
      },
    },
  });

  const portionGroup = await prisma.modifierGroup.create({
    data: {
      restaurantId: abcRestaurant.id,
      name: 'Portion Size',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: {
        create: [
          { name: 'Regular (Serves 1)', priceDelta: 0.00, sortOrder: 1 },
          { name: 'Large Platter (Serves 2)', priceDelta: 140.00, sortOrder: 2 },
        ],
      },
    },
  });

  // Menu Items
  const hyderabadiBiryani = await prisma.menuItem.create({
    data: {
      categoryId: catBiryani.id,
      name: 'Royal Dum Chicken Biryani',
      description: 'Slow-cooked aromatic basmati rice layered with tender marinated spiced chicken pieces and saffron.',
      imageUrl: '/src/assets/images/food_biryani_1795189256809.jpg',
      price: 320.00,
      isVeg: false,
      availabilityStatus: ItemAvailability.AVAILABLE,
      modifierGroups: {
        create: [
          { modifierGroupId: portionGroup.id, sortOrder: 1 },
          { modifierGroupId: spiceLevelGroup.id, sortOrder: 2 },
        ],
      },
    },
  });

  const paneerTikka = await prisma.menuItem.create({
    data: {
      categoryId: catStarters.id,
      name: 'Amritsari Paneer Tikka',
      description: 'Cubes of fresh cottage cheese marinated in hung curd and carom seeds, skewered and baked in clay tandoor.',
      imageUrl: '/src/assets/images/food_paneer_starter_1795189256999.jpg',
      price: 260.00,
      isVeg: true,
      availabilityStatus: ItemAvailability.AVAILABLE,
      modifierGroups: {
        create: [
          { modifierGroupId: spiceLevelGroup.id, sortOrder: 1 },
        ],
      },
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: catBeverages.id,
      name: 'Fresh Mint Lime Soda',
      description: 'Chilled sparkling club soda muddled with freshly crushed garden mint, key lime juice, and rock salt.',
      imageUrl: '/src/assets/images/food_mojito_lime_1795189256773.jpg',
      price: 90.00,
      isVeg: true,
      availabilityStatus: ItemAvailability.AVAILABLE,
    },
  });

  console.log('✓ ABC Restaurant seeded with branches, tables, QR tokens, tax rules, and menu catalog.');
  } else {
    console.log('✓ ABC Restaurant already exists, skipping duplicate creation.');
  }

  // 5. Spice Courtyard & Malabar Table (Basic accounts for multi-tenant isolation testing)
  const existingSpice = await prisma.restaurant.findUnique({
    where: { slug: 'spice-courtyard' },
  });

  if (!existingSpice) {
  const spiceTenant = await prisma.tenant.create({ data: { name: 'Spice Courtyard Pvt Ltd' } });
  const spiceRestaurant = await prisma.restaurant.create({
    data: {
      tenantId: spiceTenant.id,
      name: 'Spice Courtyard',
      slug: 'spice-courtyard',
      payAtRestaurantEnabled: false,
    },
  });

  const ananyaOwner = await prisma.user.upsert({
    where: { email: 'ananya@spicecourtyard.in' },
    update: {},
    create: {
      email: 'ananya@spicecourtyard.in',
      passwordHash,
      displayName: 'Ananya Roy',
      platformRole: PlatformRole.RESTAURANT_USER,
    },
  });

  await prisma.restaurantMembership.create({
    data: {
      restaurantId: spiceRestaurant.id,
      userId: ananyaOwner.id,
      role: RestaurantRole.OWNER,
    },
  });

  await prisma.restaurantSubscription.create({
    data: {
      restaurantId: spiceRestaurant.id,
      planId: enterprisePlan.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: now,
      endsAt: oneYearFromNow,
    },
  });

  console.log('✓ Spice Courtyard demo restaurant seeded.');
  } else {
    console.log('✓ Spice Courtyard already exists, skipping duplicate creation.');
  }
  console.log('🚀 Seeding complete! Database is primed and ready.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
