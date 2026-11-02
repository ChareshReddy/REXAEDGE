import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('============================================================');
console.log('  RUNNING FRONTEND ESLINT (NO-UNDEF & INTEGRITY CHECK)      ');
console.log('============================================================\n');
try {
  execSync(`npm run lint --prefix "${frontendDir}"`, { stdio: 'inherit' });
  console.log('\n✓ Frontend ESLint passed with 0 undefined identifiers\n');
} catch (err) {
  console.error('\n❌ Frontend ESLint detected undefined identifiers or errors!');
  process.exit(err.status || 1);
}

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
  'test/noPermittedServerAccess.test.js',
  'test/emptyMastBomHandling.test.js',
  'test/appPermissions.test.js',
  'test/compactDiagnosticMessage.test.js',
  'test/dualStatePermissions.test.js',
  'test/loginPageUi.test.js',
  'test/restrictValueRange.test.js',
  'test/storageLocations.test.js',
  'test/navigationAndBreadcrumbs.test.js',
  'test/routedViewsRender.test.js',
  'test/authRetryResilience.test.js',
  'test/loginKeepAliveResilience.test.js',
  'test/themeAndLayoutRedesign.test.js',
  'test/toastNotificationLayout.test.js',
  'test/createBomTooltips.test.js',
  'test/bomUsages.test.js',
  'test/activityLogs.test.js',
  'test/bomExplorerLoading.test.js',
  'test/friendlyError.test.js',
  'test/homePageRedesign.test.js'
];

const env = {
  ...process.env,
  NODE_ENV: 'test',
  USE_MOCK_SAP: 'true',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'test-model',
  SAP_DEV_URL: process.env.SAP_DEV_URL || 'https://sap-dev.corp.internal/sap/opu/odata/sap'
};

for (const file of testFiles) {
  try {
    execSync(`node ${file}`, { env, stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  } catch (err) {
    process.exit(err.status || 1);
  }
}
