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
import { requireAuth, requireServerAccess, requireModuleAccess } from '../middleware/auth.js';
import { MODULE_KEYS } from '../config/modules.js';
import { auditLogger } from '../services/auditLog.js';

const router = express.Router();

// Enforce authentication and BOM module enablement on all BOM routes
router.use(requireAuth);
router.use(requireModuleAccess(MODULE_KEYS.BOM));

/**
 * GET /api/bom/ping
 * Checks RFC connectivity to SAP on permitted server.
 */
router.get('/ping', requireServerAccess('read_only'), async (req, res) => {
  try {
    const pingResult = await pingRfcServer(req.selectedServer || {});
    if (!pingResult.success) {
      return res.status(500).json(pingResult);
    }
    return res.status(200).json(pingResult);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * POST /api/bom/validate-source
 * Validates a source / reference BOM in SAP via fast RFC (CSAP_MAT_BOM_READ)
 * or fallback GUI Scripting.
 */
router.post('/validate-source', requireServerAccess('read_only'), async (req, res) => {
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

    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] validate-source error:', err.message);
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
router.post('/read', requireServerAccess('read_only'), async (req, res) => {
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
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `BOM Read failed: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/create
 * Creates a Material BOM via CSAP_MAT_BOM_CREATE (Requires read_write permission).
 */
router.post('/create', requireServerAccess('read_write'), async (req, res) => {
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
    return res.status(500).json({
      success: false,
      message: `BOM Creation failed: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/hierarchy
 * Serves Multi-Level component tree for BOM Hierarchy Explorer.
 */
router.post('/hierarchy', requireServerAccess('read_only'), async (req, res) => {
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
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Failed to explode BOM hierarchy: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/copy
 * Copies a BOM from source to target (Requires read_write permission).
 */
router.post('/copy', requireServerAccess('read_write'), async (req, res) => {
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
    return res.status(500).json({
      success: false,
      message: `BOM Copy failed: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/verify-copy
 * Reads created target hierarchy back from SAP and strictly verifies against source hierarchy.
 */
router.post('/verify-copy', requireServerAccess('read_only'), async (req, res) => {
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
    console.error('[bom.js] verify-copy error:', err.message);
    return res.status(500).json({
      success: false,
      status: 'FAILED',
      message: `Failed to verify copied BOM: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/delete
 * Deletes a BOM via CSAP_MAT_BOM_DELETE (Requires read_write permission).
 */
router.post('/delete', requireServerAccess('read_write'), async (req, res) => {
  try {
    const { material, plant, bomUsage, alternativeBom } = req.body || {};
    const result = await rfcDeleteBom({
      material,
      plant,
      bomUsage,
      alternativeBom,
      server: req.selectedServer
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
    return res.status(500).json({
      success: false,
      message: `BOM Delete failed: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/batch-validate
 * Validates an array of BOM copy requests against SAP on permitted server.
 */
router.post('/batch-validate', requireServerAccess('read_only'), async (req, res) => {
  try {
    const { items = [], copyHierarchy = true } = req.body || {};
    const result = await rfcBatchValidateBoms(items, { copyHierarchy, server: req.selectedServer });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] batch-validate error:', err.message);
    return res.status(500).json({
      success: false,
      message: `Batch validation failed: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/batch-copy
 * Executes batch BOM copy sequentially (Requires read_write permission).
 */
router.post('/batch-copy', requireServerAccess('read_write'), async (req, res) => {
  try {
    const { items = [], skipErrors = true, copyHierarchy = true } = req.body || {};
    const result = await rfcBatchCopyBoms(items, { skipErrors, copyHierarchy, server: req.selectedServer });

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
router.get('/template', requireServerAccess('read_only'), (req, res) => {
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
router.post('/create-preflight', requireServerAccess('read_only'), async (req, res) => {
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
router.post('/create-single', requireServerAccess('read_write'), async (req, res) => {
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
    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] create-single error:', err.message);
    return res.status(500).json({
      success: false,
      message: `Failed to create BOM: ${err.message}`
    });
  }
});

/**
 * POST /api/bom/create-bulk
 * Executes bulk BOM creation sequentially (Requires read_write permission).
 */
router.post('/create-bulk', requireServerAccess('read_write'), async (req, res) => {
  try {
    if (!checkProdConfirmation(req, res)) return;
    const { boms = [], fileName = '' } = req.body || {};
    if (!Array.isArray(boms) || boms.length === 0) {
      return res.status(400).json({ success: false, message: 'No BOMs provided for bulk creation.' });
    }
    const result = await rfcBatchCreateBoms({
      boms,
      server: req.selectedServer,
      user: req.user,
      fileName
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[bom.js] create-bulk error:', err.message);
    return res.status(500).json({
      success: false,
      message: `Failed to execute bulk BOM creation: ${err.message}`
    });
  }
});

/**
 * GET /api/bom/create-template
 * Generates and downloads the official template for BOM Creation.
 */
router.get('/create-template', requireServerAccess('read_only'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const sampleRows = [
      {
        'Sequence Num*': '1',
        'Material*': 'MAT_SAMPLE_01',
        'Plant*': '1010',
        'Usage*': '1',
        'Alternative*': '01',
        'Valid From*': '19.10.2026',
        'Base quantity*': '1',
        'BOM Status*': '01',
        'Alt Text': 'Production BOM Alternative 01',
        'Item category': 'L',
        'Component*': 'COMP_RAW_01',
        'Quantity*': '10',
        'StorageLocation*': '101A',
        'REFERENCE NUMBER*': 'REF-001',
        'CostingRelevncy*': 'X',
        'Engineering*': 'X',
        'Change No. To': ''
      },
      {
        'Sequence Num*': '1',
        'Material*': 'MAT_SAMPLE_01',
        'Plant*': '1010',
        'Usage*': '1',
        'Alternative*': '01',
        'Valid From*': '19.10.2026',
        'Base quantity*': '1',
        'BOM Status*': '01',
        'Alt Text': 'Production BOM Alternative 01',
        'Item category': 'L',
        'Component*': 'COMP_RAW_02',
        'Quantity*': '5',
        'StorageLocation*': '101A',
        'REFERENCE NUMBER*': 'REF-002',
        'CostingRelevncy*': 'X',
        'Engineering*': 'X',
        'Change No. To': ''
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws['!cols'] = [
      { wch: 15 },
      { wch: 18 },
      { wch: 10 },
      { wch: 8 },
      { wch: 12 },
      { wch: 14 },
      { wch: 15 },
      { wch: 12 },
      { wch: 28 },
      { wch: 14 },
      { wch: 18 },
      { wch: 12 },
      { wch: 16 },
      { wch: 22 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Create_BOM_Template');
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

export default router;
