export { OADocumentEditor } from "./OADocumentEditor";
export { generateOAPdf, downloadPdf } from "./oaPdfGenerator";
export {
  OA_SCHEMA,
  getAllOaFields,
  getOaSectionFields,
  getRequiredOaFields,
  getOaFieldsBySource,
  getOaPdfMappedFields,
  buildPdfFieldMap,
} from "./oaFieldSchema";
export {
  useDocumentInstances,
  useSaveDocumentInstance,
  useCompleteDocumentInstance,
  useUploadInstancePdf,
  useDeleteDocumentInstance,
} from "./useDocumentInstances";
export {
  validatePdfMapping,
  validatePdfTemplate,
  validateOADocument,
  groupErrorsBySection,
  getErrorFieldIds,
  type ValidationError,
  type ValidationResult,
  type PdfValidationResult,
} from "./oaValidation";
export {
  buildInitialOADocument,
  mergeAutofillIntoData,
  calculateFinancials,
  createEmptyOaData,
  type OaAutofillContext,
} from "./oaAutofill";
