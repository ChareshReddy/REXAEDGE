import express from 'express';
import XLSX from 'xlsx';
import {
  rfcValidateSourceBom,
  rfcReadBom,
  rfcExplodeBomHierarchy,
  rfcCreateBom,
  rfcCopyBom,
  rfcDeleteBom,
  rfcBatchValidateBoms,
  rfcBatchCopyBoms,
  rfcGetBomDisplayData,
  verifyCopiedBomHierarchy,
  pingRfcServer
} from '../services/sapRfcClient.js';
import { validateSourceBom as validateSourceBomGui } from '../services/sapGuiClient.js';
import { parseBomSpreadsheet } from '../services/bomSpreadsheetParser.js';
import {
  rfcPreflightCreateBoms,
  createBomFromData,
  rfcBatchCreateBoms
} from '../services/bomCreateEngine.js';
import { requireAuth, requireServerAccess, requireModuleAccess, requireAppPermission } from '../middleware/auth.js';
import { MODULE_KEYS } from '../config/modules.js';
import { auditLogger } from '../services/auditLog.js';
import { recordRouteAudit } from '../utils/auditHelper.js';
import { sendFriendlyError } from '../utils/friendlyError.js';
import { bomJobManager, MAX_BOMS } from '../services/bomJobManager.js';

const router = express.Router();

// Enforce authentication and BOM module enablement on all BOM routes
router.use(requireAuth);
router.use(requireModuleAccess(MODULE_KEYS.BOM));

/**
 * GET /api/bom/ping
 * Checks RFC connectivity to SAP on permitted server.
 */
router.get('/ping', requireAppPermission('bom.*'), async (req, res) => {
  try {
    const pingResult = await pingRfcServer(req.selectedServer || {});
    if (!pingResult.success) {
      return res.status(500).json(pingResult);
    }
    return res.status(200).json(pingResult);
  } catch (err) {
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/validate-source
 * Validates a source / reference BOM in SAP via fast RFC (CSAP_MAT_BOM_READ)
 * or fallback GUI Scripting.
 */
router.post('/validate-source', requireAppPermission(['bom.validate', 'bom.copy']), async (req, res) => {
  try {
    const { material, plant, bomUsage, alternativeBom } = req.body || {};

    if (!material || !String(material).trim()) {
      return res.status(200).json({
        success: false,
        errorCode: 'MATERIAL_NOT_FOUND',
        message: 'Material is required for source BOM validation.'
      });
    }

    if (!plant || !String(plant).trim()) {
      return res.status(200).json({
        success: false,
        errorCode: 'MATERIAL_PLANT_INVALID',
        message: 'Plant is required for source BOM validation.'
      });
    }

    const isMock = process.env.USE_MOCK_SAP === 'true';
    const useRfc = process.env.SAP_BOM_MODE === 'RFC' || (!isMock && process.env.SAP_BOM_MODE !== 'GUI');
    let result;
    if (useRfc && !isMock) {
      result = await rfcValidateSourceBom({
        material,
        plant,
        bomUsage,
        alternativeBom,
        server: req.selectedServer
      });
    } else {
      result = await validateSourceBomGui({
        material,
        plant,
        bomUsage,
        alternativeBom
      });
    }

    recordRouteAudit(req, {
      action: 'bom.validate',
      feature: 'bom',
      target: `${material}/${plant}`,
      status: result.success ? 'success' : 'failed',
      message: result.message || (result.success ? 'Source BOM validated' : 'Validation failed'),
      details: { material, plant, bomUsage, alternativeBom, errorCode: result.errorCode }
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] validate-source error:', err.message);
    recordRouteAudit(req, {
      action: 'bom.validate',
      feature: 'bom',
      target: req.body?.material ? `${req.body.material}/${req.body.plant || ''}` : 'unknown',
      status: 'failed',
      message: err.message,
      details: { error: err.message }
    });
    return res.status(200).json({
      success: false,
      errorCode: 'SAP_VALIDATION_ERROR',
      message: `Source BOM validation failed: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/read
 * Serves Single Level Display BOM for BOM Hierarchy Explorer.
 */
router.post('/read', requireAppPermission('bom.display'), async (req, res) => {
  try {
    const { material, plant, bomUsage, alternativeBom } = req.body || {};
    const result = await rfcGetBomDisplayData({
      material,
      plant,
      bomUsage,
      alternativeBom,
      multiLevel: false,
      server: req.selectedServer
    });

    recordRouteAudit(req, {
      action: 'bom.display',
      feature: 'bom',
      target: `${material}/${plant}`,
      status: result.success ? 'success' : 'failed',
      message: result.success ? 'BOM read successfully' : (result.message || 'BOM read failed'),
      details: { material, plant, bomUsage, alternativeBom, multiLevel: false }
    });

    if (!result.success && result.errorCode === 'BOM_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    recordRouteAudit(req, {
      action: 'bom.display',
      feature: 'bom',
      target: req.body?.material ? `${req.body.material}/${req.body.plant || ''}` : 'unknown',
      status: 'failed',
      message: err.message
    });
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/create
 * Creates a Material BOM via CSAP_MAT_BOM_CREATE (Requires read_write permission).
 */
router.post('/create', requireAppPermission('bom.create'), async (req, res) => {
  try {
    const { material, plant, bomUsage, alternativeBom, validFrom, components } = req.body || {};
    const result = await rfcCreateBom({
      material,
      plant,
      bomUsage,
      alternativeBom,
      validFrom,
      components,
      server: req.selectedServer
    });

    recordRouteAudit(req, {
      action: 'bom.create',
      feature: 'bom',
      target: `${material}/${plant}`,
      status: result.success ? 'success' : 'failed',
      message: result.message || (result.success ? 'BOM created successfully' : 'BOM creation failed'),
      details: { material, plant, bomUsage, alternativeBom, componentCount: components?.length || 0 }
    });

    if (result.success) {
      auditLogger.logAction({
        user: req.user.email,
        sapUsername: req.user.email,
        system: req.selectedServer?.name || 'SAP-BOM',
        actionType: 'create',
        entityKey: 'bom',
        recordId: `${material}/${plant}`,
        task: `Create BOM ${material} in plant ${plant}`,
        afterValues: { material, plant, bomUsage, alternativeBom, componentCount: components?.length || 0 }
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    recordRouteAudit(req, {
      action: 'bom.create',
      feature: 'bom',
      target: req.body?.material ? `${req.body.material}/${req.body.plant || ''}` : 'unknown',
      status: 'failed',
      message: err.message
    });
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/hierarchy
 * Serves Multi-Level component tree for BOM Hierarchy Explorer.
 */
router.post('/hierarchy', requireAppPermission('bom.display'), async (req, res) => {
  try {
    const { material, plant, bomUsage, alternativeBom } = req.body || {};
    const result = await rfcGetBomDisplayData({
      material,
      plant,
      bomUsage,
      alternativeBom,
      multiLevel: true,
      server: req.selectedServer
    });

    recordRouteAudit(req, {
      action: 'bom.display',
      feature: 'bom',
      target: `${material}/${plant}`,
      status: result.success ? 'success' : 'failed',
      message: result.success ? 'BOM hierarchy read successfully' : (result.message || 'BOM hierarchy read failed'),
      details: { material, plant, bomUsage, alternativeBom, multiLevel: true }
    });

    if (!result.success && result.errorCode === 'BOM_NOT_FOUND') {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    recordRouteAudit(req, {
      action: 'bom.display',
      feature: 'bom',
      target: req.body?.material ? `${req.body.material}/${req.body.plant || ''}` : 'unknown',
      status: 'failed',
      message: err.message
    });
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/copy
 * Copies a BOM from source to target (Requires read_write permission).
 */
router.post('/copy', requireAppPermission('bom.copy'), async (req, res) => {
  try {
    const {
      sourceMaterial,
      sourcePlant,
      targetMaterial,
      targetPlant,
      bomUsage,
      alternativeBom,
      sourceAlternative,
      targetAlternative,
      copyHierarchy = true
    } = req.body || {};

    const result = await rfcCopyBom({
      sourceMaterial,
      sourcePlant,
      targetMaterial,
      targetPlant,
      bomUsage,
      alternativeBom,
      sourceAlternative,
      targetAlternative,
      copyHierarchy,
      server: req.selectedServer
    });

    recordRouteAudit(req, {
      action: 'bom.copy',
      feature: 'bom',
      target: `${targetMaterial}/${targetPlant}`,
      status: result.success ? 'success' : 'failed',
      message: result.message || (result.success ? `Copied from ${sourceMaterial}(${sourcePlant})` : 'BOM copy failed'),
      details: { sourceMaterial, sourcePlant, targetMaterial, targetPlant, targetAlternative, copyHierarchy }
    });

    if (result.success) {
      auditLogger.logAction({
        user: req.user.email,
        sapUsername: req.user.email,
        system: req.selectedServer?.name || 'SAP-BOM',
        actionType: 'copy',
        entityKey: 'bom',
        recordId: `${targetMaterial}/${targetPlant}`,
        task: `Copy BOM from ${sourceMaterial}(${sourcePlant}) to ${targetMaterial}(${targetPlant})`,
        afterValues: { sourceMaterial, sourcePlant, targetMaterial, targetPlant, targetAlternative }
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    recordRouteAudit(req, {
      action: 'bom.copy',
      feature: 'bom',
      target: req.body?.targetMaterial ? `${req.body.targetMaterial}/${req.body.targetPlant || ''}` : 'unknown',
      status: 'failed',
      message: err.message
    });
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/verify-copy
 * Reads created target hierarchy back from SAP and strictly verifies against source hierarchy.
 */
router.post('/verify-copy', requireAppPermission('bom.copy'), async (req, res) => {
  try {
    const {
      sourceMaterial,
      sourcePlant,
      sourceUsage,
      sourceAlternative,
      targetMaterial,
      targetPlant,
      targetUsage,
      targetAlternative
    } = req.body || {};

    const result = await verifyCopiedBomHierarchy({
      sourceMaterial,
      sourcePlant,
      sourceUsage,
      sourceAlternative,
      targetMaterial,
      targetPlant,
      targetUsage,
      targetAlternative,
      server: req.selectedServer
    });

    auditLogger.logAction({
      user: req.user?.email || 'SYSTEM',
      sapUsername: req.user?.email || 'SYSTEM',
      system: req.selectedServer?.name || 'SAP-BOM',
      actionType: 'verify_copy',
      entityKey: 'bom',
      recordId: `${targetMaterial}/${targetPlant}`,
      task: `Post-copy BOM hierarchy verification for ${targetMaterial} in plant ${targetPlant}`,
      result: result.status || (result.success ? 'SUCCESS' : 'FAILED'),
      afterValues: {
        sourceMaterial,
        sourcePlant,
        targetMaterial,
        targetPlant,
        rootAlternative: result.rootAlternative,
        bomsCreated: result.bomsCreated,
        totalComponents: result.totalComponents,
        verifiedCount: result.verification?.verifiedCount,
        totalCount: result.verification?.totalCount,
        status: result.status,
        differences: result.verification?.differences || []
      }
    });

    return res.status(200).json(result);
  } catch (err) {
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/delete
 * Deletes a BOM via CSAP_MAT_BOM_DELETE (Requires read_write permission).
 */
router.post('/delete', requireAppPermission('bom.delete'), async (req, res) => {
  try {
    const { material, plant, bomUsage, alternativeBom } = req.body || {};
    const result = await rfcDeleteBom({
      material,
      plant,
      bomUsage,
      alternativeBom,
      server: req.selectedServer
    });

    recordRouteAudit(req, {
      action: 'bom.delete',
      feature: 'bom',
      target: `${material}/${plant}`,
      status: result.success ? 'success' : 'failed',
      message: result.message || (result.success ? 'BOM deleted successfully' : 'BOM deletion failed'),
      details: { material, plant, bomUsage, alternativeBom }
    });

    if (result.success) {
      auditLogger.logAction({
        user: req.user.email,
        sapUsername: req.user.email,
        system: req.selectedServer?.name || 'SAP-BOM',
        actionType: 'delete',
        entityKey: 'bom',
        recordId: `${material}/${plant}`,
        task: `Delete BOM ${material} in plant ${plant}`,
        afterValues: { material, plant, bomUsage, alternativeBom }
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    recordRouteAudit(req, {
      action: 'bom.delete',
      feature: 'bom',
      target: req.body?.material ? `${req.body.material}/${req.body.plant || ''}` : 'unknown',
      status: 'failed',
      message: err.message
    });
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/batch-validate
 * Validates an array of BOM copy requests against SAP on permitted server.
 */
router.post('/batch-validate', requireAppPermission('bom.copy'), async (req, res) => {
  try {
    const { items = [], copyHierarchy = true } = req.body || {};
    if (items.length > MAX_BOMS) {
      return res.status(400).json({
        success: false,
        code: 'BOM_LIMIT_EXCEEDED',
        message: `Request contains ${items.length} BOM copy rows, which exceeds the maximum limit of ${MAX_BOMS} BOMs. Please split into smaller batches.`
      });
    }
    const result = await rfcBatchValidateBoms(items, { copyHierarchy, server: req.selectedServer });
    return res.status(200).json(result);
  } catch (err) {
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/batch-copy
 * Executes batch BOM copy sequentially (Requires read_write permission).
 */
router.post('/batch-copy', requireAppPermission('bom.copy'), async (req, res) => {
  try {
    const { items = [], skipErrors = true, copyHierarchy = true } = req.body || {};
    if (items.length > MAX_BOMS) {
      return res.status(400).json({
        success: false,
        code: 'BOM_LIMIT_EXCEEDED',
        message: `Request contains ${items.length} BOM copy rows, which exceeds the maximum limit of ${MAX_BOMS} BOMs. Please split into smaller batches.`
      });
    }
    const result = await rfcBatchCopyBoms(items, { skipErrors, copyHierarchy, server: req.selectedServer });

    const failedKeys = (result.results || [])
      .filter(r => !r.success)
      .slice(0, 5)
      .map(r => `${r.targetMaterial || r.sourceMaterial || 'unknown'}/${r.targetPlant || 'unknown'}`);
    recordRouteAudit(req, {
      action: 'bom.copy_bulk',
      feature: 'bom',
      target: `Batch-${items.length}`,
      status: result.success ? 'success' : 'failed',
      message: `Bulk BOM copy: ${result.successfulCount || 0} succeeded, ${result.failedCount || 0} failed`,
      details: {
        rows: items.length,
        succeeded: result.successfulCount || 0,
        failed: result.failedCount || 0,
        firstFailedKeys: failedKeys
      }
    });

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      system: req.selectedServer?.name || 'SAP-BOM',
      actionType: 'batch_copy',
      entityKey: 'bom',
      recordId: `Batch-${items.length}`,
      task: `Batch copied ${items.length} BOMs`,
      afterValues: { total: items.length, successful: result.successfulCount || 0 }
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] batch-copy error:', err.message);
    return res.status(500).json({
      success: false,
      message: `Batch copy failed: ${err.message}`
    });
  }
});

/**
 * GET /api/bom/template
 * Generates and downloads the official Excel template for Bulk BOM Copy.
 */
router.get('/template', requireAppPermission('bom.copy'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const sampleData = [
      {
        'Source Material': 'A1BH0214C',
        'Source Plant': '1012',
        'Source BOM Usage': '1',
        'Source Alternative': '1',
        'Target Material': 'A1BH0214C',
        'Target Plant': '1001',
        'Target BOM Usage': '1',
        'Target Alternative': '12'
      },
      {
        'Source Material': 'A1BH0214C',
        'Source Plant': '1012',
        'Source BOM Usage': '1',
        'Source Alternative': '2',
        'Target Material': 'A1BH0214C',
        'Target Plant': '1001',
        'Target BOM Usage': '1',
        'Target Alternative': '13'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'BOM_Copy_Template');

    const instructionsData = [
      {
        'Column Name': 'Source Material',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': 'Material number of the existing source BOM in SAP'
      },
      {
        'Column Name': 'Source Plant',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': 'Plant code where the source BOM is located (e.g. 1012)'
      },
      {
        'Column Name': 'Target Plant',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': 'Plant code where the new BOM will be copied (e.g. 1001)'
      },
      {
        'Column Name': 'Target Alternative',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': 'Target alternative number (e.g. 02, 12)'
      },
      {
        'Column Name': 'Source BOM Usage',
        'Required / Optional': 'Optional',
        'Default Value': '1',
        'Description': 'Source BOM usage code (defaults to 1 = Production)'
      },
      {
        'Column Name': 'Source Alternative',
        'Required / Optional': 'Optional',
        'Default Value': '1',
        'Description': 'Source alternative number (defaults to 1 or lowest alternative)'
      },
      {
        'Column Name': 'Target Material',
        'Required / Optional': 'Optional',
        'Default Value': 'Source Material',
        'Description': 'Target material number (defaults to Source Material if empty)'
      },
      {
        'Column Name': 'Target BOM Usage',
        'Required / Optional': 'Optional',
        'Default Value': '1',
        'Description': 'Target BOM usage code (defaults to 1 = Production)'
      }
    ];

    const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
    instructionsWs['!cols'] = [
      { wch: 22 },
      { wch: 22 },
      { wch: 20 },
      { wch: 60 }
    ];
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="BOM_Copy_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Failed to generate Excel template: ${err.message}`
    });
  }
});

/**
 * Helper to enforce PROD typing "CONFIRM" and non-empty business reason
 */
function checkProdConfirmation(req, res) {
  if (req.selectedServer?.environment === 'PROD') {
    const { confirmText, reason } = req.body || {};
    if (confirmText !== 'CONFIRM') {
      res.status(400).json({
        success: false,
        message: 'Production execution requires typing CONFIRM in uppercase.'
      });
      return false;
    }
    if (!reason || !String(reason).trim()) {
      res.status(400).json({
        success: false,
        message: 'Production execution requires a valid business reason.'
      });
      return false;
    }
  }
  return true;
}

/**
 * POST /api/bom/create-preflight
 * Runs pre-flight validation on either uploaded spreadsheet or structured BOM payload.
 */
router.post('/create-preflight', requireAppPermission('bom.create'), async (req, res) => {
  try {
    let bomsToValidate = [];
    let parseInfo = null;

    if (req.body.fileContent) {
      const raw = req.body.fileContent;
      const buffer = raw.startsWith('data:')
        ? Buffer.from(raw.split(',')[1], 'base64')
        : Buffer.from(raw, 'base64');
      parseInfo = parseBomSpreadsheet(buffer);
      if (parseInfo.errors && parseInfo.errors.length > 0 && parseInfo.boms.length === 0) {
        return res.status(400).json({
          success: false,
          message: parseInfo.errors.join(' | ')
        });
      }
      bomsToValidate = parseInfo.boms;
      // Zero-storage guarantee: clear buffer reference immediately
      parseInfo = null;
    } else if (Array.isArray(req.body.boms)) {
      bomsToValidate = req.body.boms;
    } else if (req.body.bom) {
      bomsToValidate = [req.body.bom];
    } else {
      return res.status(400).json({
        success: false,
        message: 'No fileContent or boms array provided for pre-flight validation.'
      });
    }

    if (bomsToValidate.length > MAX_BOMS) {
      return res.status(400).json({
        success: false,
        code: 'BOM_LIMIT_EXCEEDED',
        message: `Uploaded file contains ${bomsToValidate.length} BOMs, which exceeds the maximum limit of ${MAX_BOMS} BOMs. Please split into smaller batches.`
      });
    }

    const preflightResult = await rfcPreflightCreateBoms({
      boms: bomsToValidate,
      server: req.selectedServer
    });

    return res.status(200).json({
      success: true,
      totalRows: parseInfo ? parseInfo.totalRows : bomsToValidate.reduce((acc, b) => acc + (b.components?.length || 1), 0),
      totalBoms: preflightResult.boms.length,
      readyCount: preflightResult.readyCount,
      skippedCount: preflightResult.skippedCount,
      invalidCount: preflightResult.invalidCount,
      boms: preflightResult.boms
    });
  } catch (err) {
    console.error('[bom.js] create-preflight error:', err.message);
    return res.status(500).json({
      success: false,
      message: `Pre-flight validation failed: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/create-single
 * Creates a single BOM from user-supplied header and components (Requires read_write permission).
 */
router.post('/create-single', requireAppPermission('bom.create'), async (req, res) => {
  try {
    if (!checkProdConfirmation(req, res)) return;
    const { bom } = req.body || {};
    if (!bom) {
      return res.status(400).json({ success: false, message: 'BOM data is required.' });
    }
    const result = await createBomFromData({
      bom,
      server: req.selectedServer,
      user: req.user,
      source: 'single'
    });

    const target = bom ? `${bom.material}/${bom.plant}` : 'unknown';
    recordRouteAudit(req, {
      action: 'bom.create',
      feature: 'bom',
      target,
      status: result.success ? 'success' : 'failed',
      message: result.message || (result.success ? 'BOM created successfully' : 'Failed to create BOM'),
      details: { material: bom?.material, plant: bom?.plant, componentCount: bom?.components?.length || 0 }
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] create-single error:', err.message);
    recordRouteAudit(req, {
      action: 'bom.create',
      feature: 'bom',
      target: req.body?.bom?.material ? `${req.body.bom.material}/${req.body.bom.plant || ''}` : 'unknown',
      status: 'failed',
      message: err.message
    });
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * POST /api/bom/create-bulk
 * Executes bulk BOM creation sequentially (Requires read_write permission).
 */
router.post('/create-bulk', requireAppPermission('bom.create'), async (req, res) => {
  try {
    if (!checkProdConfirmation(req, res)) return;
    const { boms = [], fileName = '' } = req.body || {};
    if (!Array.isArray(boms) || boms.length === 0) {
      return res.status(400).json({ success: false, message: 'No BOMs provided for bulk creation.' });
    }
    if (boms.length > MAX_BOMS) {
      return res.status(400).json({
        success: false,
        code: 'BOM_LIMIT_EXCEEDED',
        message: `Request contains ${boms.length} BOMs, which exceeds the maximum limit of ${MAX_BOMS} BOMs. Please split into smaller batches.`
      });
    }
    const result = await rfcBatchCreateBoms({
      boms,
      server: req.selectedServer,
      user: req.user,
      fileName
    });

    const failedKeys = (result.results || [])
      .filter(r => !r.success)
      .slice(0, 5)
      .map(r => `${r.material || 'unknown'}/${r.plant || 'unknown'}`);
    recordRouteAudit(req, {
      action: 'bom.create_bulk',
      feature: 'bom',
      target: `Batch-${boms.length}`,
      status: result.success ? 'success' : 'failed',
      message: `Bulk BOM create: ${result.bomsCreated || 0} created, ${result.failedCount || 0} failed, ${result.skippedCount || 0} skipped`,
      details: {
        rows: boms.length,
        succeeded: result.bomsCreated || 0,
        failed: result.failedCount || 0,
        skipped: result.skippedCount || 0,
        firstFailedKeys: failedKeys
      }
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] create-bulk error:', err.message);
    recordRouteAudit(req, {
      action: 'bom.create_bulk',
      feature: 'bom',
      target: `Batch-${req.body?.boms?.length || 0}`,
      status: 'failed',
      message: err.message
    });
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * GET /api/bom/create-template
 * Generates and downloads the official template for BOM Creation.
 */
router.get('/create-template', requireAppPermission('bom.create'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const sampleRows = [
      {
        'Material': 'MAT_SAMPLE_01',
        'Plant': '1010',
        'Component': 'COMP_RAW_01',
        'Quantity': '10',
        'BOM Usage': '1',
        'Alternative BOM': '01',
        'Item Category': 'L',
        'Valid From': '19.10.2026',
        'Base Qty': '1',
        'BOM Status': '01',
        'Storage Location': '101A',
        'Alt Text': 'Production BOM Alternative 01',
        'Reference Number': 'REF-001',
        'Costing Relevancy': 'X',
        'Engineering': 'X',
        'Change No': ''
      },
      {
        'Material': 'MAT_SAMPLE_01',
        'Plant': '1010',
        'Component': 'COMP_RAW_02',
        'Quantity': '5',
        'BOM Usage': '1',
        'Alternative BOM': '01',
        'Item Category': 'L',
        'Valid From': '19.10.2026',
        'Base Qty': '1',
        'BOM Status': '01',
        'Storage Location': '101A',
        'Alt Text': 'Production BOM Alternative 01',
        'Reference Number': 'REF-002',
        'Costing Relevancy': 'X',
        'Engineering': 'X',
        'Change No': ''
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 10 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Create_BOM_Template');

    const instructionsData = [
      {
        'Column Name': 'Material',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': 'SAP Material Number for the header BOM'
      },
      {
        'Column Name': 'Plant',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': '4-character SAP Plant code (e.g. 1010)'
      },
      {
        'Column Name': 'Component',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': 'SAP Component / item material number'
      },
      {
        'Column Name': 'Quantity',
        'Required / Optional': 'Required',
        'Default Value': 'None',
        'Description': 'Component quantity per base unit (numeric, > 0)'
      },
      {
        'Column Name': 'BOM Usage',
        'Required / Optional': 'Optional',
        'Default Value': '1',
        'Description': 'SAP BOM usage code (1 = Production)'
      },
      {
        'Column Name': 'Alternative BOM',
        'Required / Optional': 'Optional',
        'Default Value': '01',
        'Description': '2-digit BOM alternative number (01 to 99)'
      },
      {
        'Column Name': 'Item Category',
        'Required / Optional': 'Optional',
        'Default Value': 'L',
        'Description': 'SAP BOM item category (L = Stock item)'
      },
      {
        'Column Name': 'Valid From',
        'Required / Optional': 'Optional',
        'Default Value': 'Today',
        'Description': 'Valid-from date in DD.MM.YYYY format'
      },
      {
        'Column Name': 'Base Qty',
        'Required / Optional': 'Optional',
        'Default Value': '1',
        'Description': 'Base quantity for the header BOM'
      },
      {
        'Column Name': 'BOM Status',
        'Required / Optional': 'Optional',
        'Default Value': '01',
        'Description': 'BOM header status code (01 = Active)'
      },
      {
        'Column Name': 'Storage Location',
        'Required / Optional': 'Optional',
        'Default Value': 'Empty',
        'Description': 'Issuing storage location (e.g. 101A)'
      },
      {
        'Column Name': 'Alt Text',
        'Required / Optional': 'Optional',
        'Default Value': 'Empty',
        'Description': 'Alternative BOM description text'
      },
      {
        'Column Name': 'Reference Number',
        'Required / Optional': 'Optional',
        'Default Value': 'Empty',
        'Description': 'Item reference note or drawing number (max 40 chars)'
      },
      {
        'Column Name': 'Costing Relevancy',
        'Required / Optional': 'Optional',
        'Default Value': 'Empty',
        'Description': 'Set to "X" if component is relevant for costing'
      },
      {
        'Column Name': 'Engineering',
        'Required / Optional': 'Optional',
        'Default Value': 'Empty',
        'Description': 'Set to "X" for engineering relevancy'
      },
      {
        'Column Name': 'Change No',
        'Required / Optional': 'Optional',
        'Default Value': 'Empty',
        'Description': 'SAP Engineering Change Order (ECO) number'
      }
    ];

    const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
    instructionsWs['!cols'] = [
      { wch: 20 },
      { wch: 22 },
      { wch: 18 },
      { wch: 55 }
    ];
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Create_BOM_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Failed to generate Excel template: ${err.message}`
    });
  }
});

// =========================================================================
// BACKGROUND JOB ENDPOINTS (Safe Bulk Processing for Hundreds of BOMs)
// =========================================================================

/**
 * POST /api/bom/jobs/start
 * Starts an asynchronous background job for Bulk Create/Copy BOM (Pre-flight, Validation, or Execution).
 * Returns immediately with { jobId } so the client can poll progress.
 */
router.post('/jobs/start', requireAppPermission((req) => {
  const type = String(req.body?.type || '').toLowerCase();
  if (type.startsWith('copy')) return 'bom.copy';
  if (type.startsWith('create')) return 'bom.create';
  return ['bom.create', 'bom.copy'];
}), async (req, res, next) => {
  const { type } = req.body || {};
  const isWriteAction = type === 'create_bulk' || type === 'copy_bulk';

  try {
    if (isWriteAction && !checkProdConfirmation(req, res)) {
      return;
    }

    const {
      items = [],
      boms = [],
      fileContent = null,
      fileName = '',
      copyHierarchy = true,
      skipErrors = true
    } = req.body || {};

    const jobItems = Array.isArray(items) && items.length > 0
      ? items
      : Array.isArray(boms)
      ? boms
      : [];

    const startResult = bomJobManager.startJob({
      type,
      user: req.user,
      server: req.selectedServer,
      items: jobItems,
      fileContent,
      fileName,
      options: { copyHierarchy, skipErrors }
    });

    return res.status(202).json(startResult);
  } catch (err) {
    if (err.code === 'ACTIVE_JOB_EXISTS') {
      return res.status(409).json({
        success: false,
        code: 'ACTIVE_JOB_EXISTS',
        message: err.message,
        activeJobId: err.activeJobId
      });
    }
    if (err.code === 'BOM_LIMIT_EXCEEDED') {
      return res.status(400).json({
        success: false,
        code: 'BOM_LIMIT_EXCEEDED',
        message: err.message,
        limit: err.limit,
        actual: err.actual
      });
    }
    if (err.code === 'EMPTY_PAYLOAD' || err.code === 'PARSE_ERROR') {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    console.error('[bom.js] jobs/start error:', err);
    return res.status(500).json({
      success: false,
      message: `Failed to initialize background job: ${err.message}`
    });
  }
});

/**
 * GET /api/bom/jobs/active
 * Checks if the current user has an active job running on the selected server.
 */
router.get('/jobs/active', requireAppPermission(['bom.create', 'bom.copy']), (req, res) => {
  try {
    const active = bomJobManager.getActiveJob(req.user?.id || req.user?.email, req.selectedServer);
    return res.status(200).json({
      success: true,
      hasActiveJob: Boolean(active),
      job: active
    });
  } catch (err) {
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * GET /api/bom/jobs/:jobId
 * Returns the status, progress counters, current BOM, and per-BOM results.
 */
router.get('/jobs/:jobId', requireAppPermission(['bom.create', 'bom.copy']), (req, res) => {
  try {
    const job = bomJobManager.getJob(req.params.jobId, req.user);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: `Job ${req.params.jobId} not found.`
      });
    }
    return res.status(200).json({
      success: true,
      job
    });
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: err.message
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * POST /api/bom/jobs/:jobId/cancel
 * Requests cancellation of a running background job.
 */
router.post('/jobs/:jobId/cancel', requireAppPermission(['bom.create', 'bom.copy']), (req, res) => {
  try {
    const cancelResult = bomJobManager.cancelJob(
      req.params.jobId,
      req.user
    );
    if (!cancelResult.success) {
      return res.status(400).json(cancelResult);
    }
    return res.status(200).json(cancelResult);
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: err.message
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

export default router;
