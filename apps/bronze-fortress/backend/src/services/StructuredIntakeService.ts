import { CriminalComplaint, NzakutOrder, PoliceCaseStatus, NzakutOrderType } from '../generated/prisma';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Domain A — Criminal allegations
// ---------------------------------------------------------------------------

export interface AddComplaintInput {
  policeStatus: PoliceCaseStatus;
  closureConsideredByCourt?: boolean;
  custodyChangedAfterClosure?: 'worsened' | 'unchanged' | 'improved';
  welfareReportCitedAfterClose?: boolean;
  complaintDate?: Date;
  closureDate?: Date;
}

// ---------------------------------------------------------------------------
// Domain B — צו נזקקות (Nzakut orders)
// ---------------------------------------------------------------------------

export interface AddNzakutInput {
  orderType: NzakutOrderType;
  evidentiaryHearingHeld: boolean;
  daysToFullHearing?: number;
  childrenLocation?: 'other_parent' | 'foster' | 'institution';
  daysWithoutMeritsHearing?: number;
  orderDate?: Date;
  hearingDate?: Date;
}

export class StructuredIntakeService {
  async addCriminalComplaint(caseId: string, data: AddComplaintInput): Promise<CriminalComplaint> {
    return prisma.criminalComplaint.create({
      data: { caseId, ...data },
    });
  }

  async listCriminalComplaints(caseId: string): Promise<CriminalComplaint[]> {
    return prisma.criminalComplaint.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addNzakutOrder(caseId: string, data: AddNzakutInput): Promise<NzakutOrder> {
    return prisma.nzakutOrder.create({
      data: { caseId, ...data },
    });
  }

  async listNzakutOrders(caseId: string): Promise<NzakutOrder[]> {
    return prisma.nzakutOrder.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
