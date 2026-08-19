import type { Adapter, AdapterPayload } from 'oidc-provider';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Prisma-backed Adapter for oidc-provider (docs/gf-mcp-oauth-dev-plan.md, Phase 2).
//
// oidc-provider constructs one instance of this class per "model kind" it needs
// to persist (Client, Grant, AuthorizationCode, AccessToken, RefreshToken,
// Session, Interaction, ...) — `name` below is that kind, and every method is
// implicitly scoped to it via the OidcModel table's (modelName, id) primary key.
// See schema.prisma's OidcModel comment for why one generic table is the right
// shape here rather than one table per kind.
//
// `revokeByGrantId` is the one method that deliberately does NOT scope by
// `this.name` — oidc-provider expects it to tear down every token/code issued
// under a grant, across every model kind, not just the calling instance's own.
// ---------------------------------------------------------------------------

function toJsonInput(payload: AdapterPayload): Prisma.InputJsonValue {
  return payload as unknown as Prisma.InputJsonValue;
}

// oidc-provider's `find*` methods must surface a prior `consume()` call as a
// `consumed` unix-seconds timestamp on the returned payload — it doesn't ask
// separately, it inspects the resolved object.
function withConsumed(row: { payload: Prisma.JsonValue; consumedAt: Date | null }): AdapterPayload {
  const payload = row.payload as AdapterPayload;
  return row.consumedAt
    ? { ...payload, consumed: Math.floor(row.consumedAt.getTime() / 1000) }
    : payload;
}

function isExpired(row: { expiresAt: Date | null }): boolean {
  return row.expiresAt !== null && row.expiresAt.getTime() < Date.now();
}

export class PrismaOidcAdapter implements Adapter {
  constructor(private readonly name: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const shared = {
      payload: toJsonInput(payload),
      grantId: payload.grantId ?? null,
      userCode: payload.userCode ?? null,
      uid: payload.uid ?? null,
      accountId: payload.accountId ?? null,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    };
    await prisma.oidcModel.upsert({
      where: { modelName_id: { modelName: this.name, id } },
      create: { modelName: this.name, id, ...shared },
      update: shared,
    });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const row = await prisma.oidcModel.findUnique({
      where: { modelName_id: { modelName: this.name, id } },
    });
    if (!row || isExpired(row)) return undefined;
    return withConsumed(row);
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const row = await prisma.oidcModel.findUnique({
      where: { modelName_userCode: { modelName: this.name, userCode } },
    });
    if (!row || isExpired(row)) return undefined;
    return withConsumed(row);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const row = await prisma.oidcModel.findUnique({
      where: { modelName_uid: { modelName: this.name, uid } },
    });
    if (!row || isExpired(row)) return undefined;
    return withConsumed(row);
  }

  async consume(id: string): Promise<void> {
    await prisma.oidcModel.update({
      where: { modelName_id: { modelName: this.name, id } },
      data: { consumedAt: new Date() },
    });
  }

  async destroy(id: string): Promise<void> {
    // deleteMany, not delete — oidc-provider may call destroy() on a row that's
    // already gone (e.g. a grant cascade beat it there); that's not an error.
    await prisma.oidcModel.deleteMany({ where: { modelName: this.name, id } });
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await prisma.oidcModel.deleteMany({ where: { grantId } });
  }
}
