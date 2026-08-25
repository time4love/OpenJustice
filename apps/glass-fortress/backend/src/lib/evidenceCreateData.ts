import type { IntakeOutput } from '../services/IntakeAgent';
import { INTAKE_VERSION, intakePromptHash } from './intakeVersion';

// The fields every evidence-creation call site derives from an IntakeOutput
// analysis are identical everywhere evidence gets written — POST /confirm,
// the two MCP create-from-{text,url} tools, and the whistleblower submission
// path. Only fileHash, status, figures-relation mode, sourceUrl, and
// createdById/fileUrl/ipfsCid/urlVersionDiffId legitimately vary by call
// site — those stay local to each caller. This covers just the shared
// subset so each Prisma `create`/`upsert` call still reads as one object,
// not a Prisma-shaped struct assembled elsewhere.
//
// The classification provenance is stamped HERE rather than at each call site,
// and that placement is the point: all five paths that write evidence go through
// this function, so none of them can forget. A stamp added per-caller is a stamp
// the sixth caller omits, and an unstamped row is indistinguishable from one
// classified under a rubric that no longer exists.
export function buildEvidenceAnalysisData(analysis: IntakeOutput) {
  return {
    intakeVersion: INTAKE_VERSION,
    intakePromptHash: intakePromptHash(),
    evidenceRole: analysis.evidenceRole,
    targetEntity: analysis.targetEntity,
    evidenceTier: analysis.evidenceTier,
    evidencePerspective: analysis.evidencePerspective,
    investigativeCategories: analysis.investigativeCategories,
    tierReasoning: analysis.tierReasoning,
    summary: analysis.summary,
    evidenceDate: analysis.evidenceDate,
    medicalConditions: JSON.stringify(analysis.medicalConditions),
    statisticalClaims: JSON.stringify(analysis.statisticalClaims),
    regulatoryMentions: JSON.stringify(analysis.regulatoryMentions),
    euaOmissionStatus: analysis.euaOmissionStatus,
  };
}
