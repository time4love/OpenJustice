import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { built } from './built';

// ---------------------------------------------------------------------------
// ui :1129 (RULED 2026-09-22) — THE UPLOAD DIALOG'S OWN ROUTER. CHUNK 4'S.
//
// THE UPLOAD DIALOG IS THE SECOND DIALOG OF ITS CLASS; the marking page is the first. A
// DIALOG HAS ALWAYS HAD ITS OWN ROUTER, and "routes are tools' answers" governs the READ
// VIEW and the PUBLIC surface, not a dialog. So this router sits BESIDE /api/article-rules,
// behind requireResearcher INSIDE it, outside researchRouter and outside `routeIsTool`'s
// three modules — which is why THAT TEST IS NOT EDITED and its subject set stays three.
//
// ONE POST taking { docId, mimeType, byteLength } and answering the SIGNED UPLOAD URL with
// its expiry. MINTING IT IS THE DIALOG'S CACHE ACT (thesis §2 :126-:132), exactly as the
// marking dialog's `PUT …/draft` is (interaction :548): it writes no row, and
// `add_document` stays the ONE ATTRIBUTED ACT.
// ---------------------------------------------------------------------------

interface Router { documentUploadRouter: unknown }

const router = () => built<Router>('routes/documentUploadRoutes');

async function routerSource(): Promise<string> {
  await router();
  return readFileSync(join(SRC, 'routes/documentUploadRoutes.ts'), 'utf8');
}

describe('ui :1129 — the router’s shape, and where the gate sits', () => {
  it('it exports its own Router', async () => {
    const { documentUploadRouter } = await router();
    expect(documentUploadRouter).toBeDefined();
  });

  it('requireResearcher is INSIDE the router, the marking router’s shape (`walk/routes.ts` :141)', async () => {
    const source = await routerSource();
    expect(source).toMatch(/\.use\(\s*requireResearcher\s*\)/);
  });

  it('ONE POST, and only one — a second write would be a second act nobody ruled', async () => {
    const source = await routerSource();
    const posts = source.match(/\.post\(/g) ?? [];
    // THE FLOOR: exactly one, so a router with none cannot pass this either.
    expect(posts).toHaveLength(1);
  });

  it('it takes { docId, mimeType, byteLength } and answers the url with its EXPIRY', async () => {
    const source = await routerSource();
    for (const field of ['docId', 'mimeType', 'byteLength']) expect(source).toContain(field);
    expect(source).toMatch(/expires|expiry|expiresAt/i);
  });

  it('IT WRITES NO ROW — minting the url is the dialog’s CACHE act', async () => {
    const source = await routerSource();
    expect(source).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete)/);
  });
});

describe('ui :1129 — where it is NOT, each of which a scan would correctly redden', () => {
  it('NOT under /api/research — whose fourteen routes are each a tool’s answer', async () => {
    const source = await routerSource();
    expect(source).not.toContain('/api/research');
  });

  it('NOT /api/documents/… — A5 :1504-:1511 reserves that prefix for step 34’s two PUBLIC serves', async () => {
    const source = await routerSource();
    expect(source).not.toMatch(/['"]\/api\/documents/);
  });

  it('NOT /intake, /submit, /withdraw or /safety — `no-door-before-it-exists` would fire on each', async () => {
    const source = await routerSource();
    for (const name of ['/intake', '/submit', '/withdraw', '/safety']) expect(source).not.toContain(`'${name}`);
  });

  it('IT IS MOUNTED BESIDE /api/article-rules, and NOT inside researchRouter', async () => {
    await router();
    const server = readFileSync(join(SRC, 'server.ts'), 'utf8');
    expect(server).toMatch(/app\.use\(\s*'\/api\/[a-z-]*upload[a-z-]*'/i);
    // The gate is NOT at the mount, exactly as :180 mounts the marking router.
    expect(server).not.toMatch(/app\.use\(\s*'\/api\/[a-z-]*upload[a-z-]*',\s*requireResearcher/i);
  });
});

describe('`routeIsTool`’s subject set is UNCHANGED — a dialog’s route was never a tool’s answer', () => {
  it('the scan still reads exactly three modules, and the upload router is not among them', async () => {
    await router();
    const scan = readFileSync(join(__dirname, '..', 'routeIsTool.test.ts'), 'utf8');
    const listed = scan.match(/ROUTE_MODULE_FILES = \[([^\]]*)\]/)?.[1] ?? '';
    const modules = listed.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    expect(modules).toHaveLength(3);
    expect(listed).not.toContain('documentUpload');
  });
});
