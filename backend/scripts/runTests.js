import { execSync } from 'child_process';

const testFiles = [
  'test/api.test.js',
  'test/chat.test.js',
  'test/writeActions.test.js',
  'test/genericEntities.test.js',
  'test/jobMonitoring.test.js',
  'test/idocMonitoring.test.js',
  'test/interfaceMonitoring.test.js',
  'test/realSapIntegration.test.js',
  'test/sensitiveActions.test.js',
  'test/multiSystem.test.js',
  'test/knowledgeBase.test.js',
  'test/bomChatFix.test.js',
  'test/structuredBomForms.test.js',
  'test/sourceBomValidation.test.js',
  'test/sapSessionMonitoring.test.js',
  'test/deleteBomVerification.test.js',
  'test/sapMultiSession.test.js',
  'test/bomStructuralPreservation.test.js',
  'test/bomDiscrepancyFixes.test.js',
  'test/crossPlantAlternativeFix.test.js',
  'test/vbsSyntaxValidation.test.js',
  'test/materialCheck.test.js',
  'test/adminAuthPermissions.test.js',
  'test/moduleAccess.test.js',
  'test/sapCredentials.test.js',
  'test/serverCreationResilience.test.js',
  'test/bomDisplayEnrichment.test.js',
  'test/copyBomResultEnrichment.test.js',
  'test/createBom.test.js',
  'test/createBomUiState.test.js',
  'test/bomHubGrouping.test.js',
  'test/fioriLaunchpadRender.test.js',
  'test/adminServerlessVisibility.test.js',
  'test/bulkUploadPanelRender.test.js',
  'test/bulkCreateBomPreviewTable.test.js',
  'test/sapMatnrPaddingAndErrors.test.js',
  'test/sapConnectionTest.test.js',
  'test/bomBackgroundJobs.test.js',
  'test/bulkBomUiFlow.test.js',
  'test/bulkCopyAlternativeResolution.test.js',
  'test/openRfcClientOptions.test.js',
  'test/materialSearch.test.js',
  'test/plants.test.js',
  'test/materialPlantParity.test.js',
  'test/searchRfcClient.test.js',
  'test/valueHelpPopup.test.js',
  'test/noPermittedServerAccess.test.js'
];

const env = {
  ...process.env,
  NODE_ENV: 'test',
  USE_MOCK_SAP: 'true'
};

for (const file of testFiles) {
  try {
    execSync(`node ${file}`, { env, stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
}
