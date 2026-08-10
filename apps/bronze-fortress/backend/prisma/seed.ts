import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// Israeli family courts — source: courts.gov.il (בתי משפט לענייני משפחה)
// IDs are stable slugs so they can be referenced in scripts and MCP tools.
const COURTS = [
  // אזור מרכז
  { id: 'court-kfar-saba',      name: 'בית המשפט לענייני משפחה בכפר סבא',      city: 'כפר סבא',      district: 'מרכז' },
  { id: 'court-ramat-gan',      name: 'בית המשפט לענייני משפחה ברמת-גן',       city: 'רמת גן',       district: 'מרכז' },
  { id: 'court-rishon-lezion',  name: 'בית המשפט לענייני משפחה בראשון לציון',  city: 'ראשון לציון',  district: 'מרכז' },
  // ירושלים
  { id: 'court-jerusalem',      name: 'בית המשפט לענייני משפחה בירושלים',      city: 'ירושלים',      district: 'ירושלים' },
  // אזור צפון
  { id: 'court-kiryat-shmona',  name: 'בית המשפט לענייני משפחה בקרית-שמונה',  city: 'קרית שמונה',   district: 'צפון' },
  { id: 'court-nazareth',       name: 'בית המשפט לענייני משפחה בנצרת',         city: 'נצרת',         district: 'צפון' },
  { id: 'court-tiberias',       name: 'בית המשפט לענייני משפחה בטבריה',        city: 'טבריה',        district: 'צפון' },
  { id: 'court-haifa',          name: 'בית המשפט לענייני משפחה בחיפה',         city: 'חיפה',         district: 'צפון' },
  // אזור דרום
  { id: 'court-ashdod',         name: 'בית המשפט לענייני משפחה באשדוד',        city: 'אשדוד',        district: 'דרום' },
  { id: 'court-beer-sheva',     name: 'בית המשפט לענייני משפחה בבאר שבע',      city: 'באר שבע',      district: 'דרום' },
  { id: 'court-eilat',          name: 'בית המשפט לענייני משפחה באילת',          city: 'אילת',         district: 'דרום' },
];

async function main() {
  console.log('Seeding Israeli family courts...');

  for (const court of COURTS) {
    await prisma.court.upsert({
      where: { id: court.id },
      update: { name: court.name, city: court.city, district: court.district },
      create: court,
    });
    console.log(`  ✓ ${court.city}`);
  }

  console.log(`\nSeeded ${COURTS.length} courts.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
