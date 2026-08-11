import {
  CriminalComplaint,
  NzakutOrder,
  WelfareReport,
  EvaluatorSession,
  GuardianContact,
  PoliceCaseStatus,
  NzakutOrderType,
} from '../generated/prisma';
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

// ---------------------------------------------------------------------------
// Domain C — Welfare professional conduct
// ---------------------------------------------------------------------------

export interface AddWelfareReportInput {
  welfareReferralAtFirstHearing: boolean;
  interviewOneSided?: boolean;
  homeVisitConducted?: boolean;
  citedDroppedAllegations?: boolean;
  recommendationChanged?: boolean;
  reportDate?: Date;
}

// ---------------------------------------------------------------------------
// Domain D — Evaluator (מאבחן) conduct
// ---------------------------------------------------------------------------

export interface AddEvaluatorSessionInput {
  sessionCount: number;
  totalDurationMinutes?: number;
  bothParentsInterviewed: boolean;
  feedbackSessionHeld: boolean;
  judgeAdoptedWithoutReview?: boolean;
  evaluationDate?: Date;
}

// ---------------------------------------------------------------------------
// Domain E — Guardian ad litem conduct
// ---------------------------------------------------------------------------

export interface AddGuardianContactInput {
  childMeetingCount: number;
  positionContradictsChild?: boolean;
  appointingJudgeFigureId?: string;
  appointmentDate?: Date;
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

  async countCriminalComplaints(caseId: string): Promise<number> {
    return prisma.criminalComplaint.count({ where: { caseId } });
  }

  async countNzakutOrders(caseId: string): Promise<number> {
    return prisma.nzakutOrder.count({ where: { caseId } });
  }

  async addWelfareReport(caseId: string, data: AddWelfareReportInput): Promise<WelfareReport> {
    return prisma.welfareReport.create({ data: { caseId, ...data } });
  }

  async listWelfareReports(caseId: string): Promise<WelfareReport[]> {
    return prisma.welfareReport.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  }

  async countWelfareReports(caseId: string): Promise<number> {
    return prisma.welfareReport.count({ where: { caseId } });
  }

  async addEvaluatorSession(caseId: string, data: AddEvaluatorSessionInput): Promise<EvaluatorSession> {
    return prisma.evaluatorSession.create({ data: { caseId, ...data } });
  }

  async listEvaluatorSessions(caseId: string): Promise<EvaluatorSession[]> {
    return prisma.evaluatorSession.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  }

  async countEvaluatorSessions(caseId: string): Promise<number> {
    return prisma.evaluatorSession.count({ where: { caseId } });
  }

  async addGuardianContact(caseId: string, data: AddGuardianContactInput): Promise<GuardianContact> {
    return prisma.guardianContact.create({ data: { caseId, ...data } });
  }

  async listGuardianContacts(caseId: string): Promise<GuardianContact[]> {
    return prisma.guardianContact.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  }

  async countGuardianContacts(caseId: string): Promise<number> {
    return prisma.guardianContact.count({ where: { caseId } });
  }
}
