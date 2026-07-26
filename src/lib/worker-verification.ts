import { Worker, WorkerDocument } from '../api/endpoints';

// The set of document types every worker must have on file before their
// application can be considered "ready for admin review". Kept in one
// place so the onboarding flow, the root navigation guard, and the
// documents screen all agree on what "complete" means.
export const REQUIRED_DOC_TYPES = ['SELFIE', 'ID_PROOF', 'ADDRESS_PROOF'] as const;

export function hasRequiredDocuments(worker: Pick<Worker, 'documents'> | null | undefined): boolean {
  if (!worker?.documents?.length) return false;
  const uploadedTypes = new Set(worker.documents.map((d: WorkerDocument) => d.type));
  return REQUIRED_DOC_TYPES.every((t) => uploadedTypes.has(t));
}

export function missingDocumentTypes(worker: Pick<Worker, 'documents'> | null | undefined): string[] {
  const uploadedTypes = new Set((worker?.documents ?? []).map((d: WorkerDocument) => d.type));
  return REQUIRED_DOC_TYPES.filter((t) => !uploadedTypes.has(t));
}