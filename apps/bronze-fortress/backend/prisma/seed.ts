import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// Israeli family courts — source: courts.gov.il (בתי משפט לענייני משפחה)
// IDs are stable slugs so they can be referenced in scripts and MCP tools.
// Source: courts.gov.il — official list of Israeli family courts only.
const COURTS = [
  // מחוז תל אביב
  { id: 'court-tel-aviv',        name: 'בית המשפט לענייני משפחה בתל אביב',      city: 'תל אביב',      district: 'תל אביב' },
  // מחוז מרכז
  { id: 'court-rishon-lezion',   name: 'בית המשפט לענייני משפחה בראשון לציון',  city: 'ראשון לציון',  district: 'מרכז' },
  { id: 'court-petah-tikva',     name: 'בית המשפט לענייני משפחה בפתח תקווה',    city: 'פתח תקווה',    district: 'מרכז' },
  // מחוז ירושלים
  { id: 'court-jerusalem',       name: 'בית המשפט לענייני משפחה בירושלים',      city: 'ירושלים',      district: 'ירושלים' },
  // מחוז צפון
  { id: 'court-nazareth',        name: 'בית המשפט לענייני משפחה בנצרת',         city: 'נצרת',         district: 'צפון' },
  { id: 'court-kiryat-shmona',   name: 'בית המשפט לענייני משפחה בקריית שמונה',  city: 'קריית שמונה',  district: 'צפון' },
  { id: 'court-tiberias',        name: 'בית המשפט לענייני משפחה בטבריה',        city: 'טבריה',        district: 'צפון' },
  // מחוז חיפה
  { id: 'court-haifa',           name: 'בית המשפט לענייני משפחה בחיפה',         city: 'חיפה',         district: 'חיפה' },
  { id: 'court-kiryat-bialik',   name: 'בית המשפט לענייני משפחה בקריות',        city: 'קרית ביאליק',  district: 'חיפה' },
  { id: 'court-hadera',          name: 'בית המשפט לענייני משפחה בחדרה',         city: 'חדרה',         district: 'חיפה' },
  // מחוז דרום
  { id: 'court-beer-sheva',      name: 'בית המשפט לענייני משפחה בבאר שבע',      city: 'באר שבע',      district: 'דרום' },
  { id: 'court-ashdod',          name: 'בית המשפט לענייני משפחה באשדוד',        city: 'אשדוד',        district: 'דרום' },
  { id: 'court-kiryat-gat',      name: 'בית המשפט לענייני משפחה בקרית גת',      city: 'קרית גת',      district: 'דרום' },
  { id: 'court-eilat',           name: 'בית המשפט לענייני משפחה באילת',          city: 'אילת',         district: 'דרום' },
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
