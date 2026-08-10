import { CooperationLevel, Case } from '../generated/prisma';
import { prisma } from '../lib/prisma';

export interface CreateCaseInput {
  publicKeyHex: string;
  supabaseUserId: string;
}

export interface UpdateEncryptedIntakeInput {
  caseId: string;
  encryptedIntakeData: string; // JSON questionnaire responses, encrypted client-side before upload
}

export class CaseVaultService {
  async createCase(input: CreateCaseInput): Promise<Case> {
    return prisma.case.create({
      data: {
        publicKeyHex: input.publicKeyHex,
        cooperationLevel: CooperationLevel.NONE,
        members: {
          create: {
            role: 'PRIMARY_CONTACT',
            supabaseUserId: input.supabaseUserId,
          },
        },
      },
    });
  }

  async storeEncryptedIntake(input: UpdateEncryptedIntakeInput): Promise<Case> {
    return prisma.case.update({
      where: { id: input.caseId },
      data: { encryptedIntakeData: input.encryptedIntakeData },
    });
  }

  async getCase(caseId: string): Promise<Case | null> {
    return prisma.case.findUnique({
      where: { id: caseId },
    });
  }

  async getCaseByMember(supabaseUserId: string): Promise<Case | null> {
    const member = await prisma.caseMember.findUnique({
      where: { supabaseUserId },
      include: { legalCase: true },
    });
    return member?.legalCase ?? null;
  }
}
