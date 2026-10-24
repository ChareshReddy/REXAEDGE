import fs from 'fs';

// Update CopyBomView.jsx
let copyView = fs.readFileSync('frontend/src/components/CopyBomView.jsx', 'utf8');

const target1 = `            {isSubmitting ? (
              <div className="sap-loading-card" style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
                <span className="sap-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <h4>Validating with SAP via RFC...</h4>
                <p>Checking source BOM in MAST/STAS/STPO and determining target alternative.</p>
              </div>
            ) : (`.replace(/\n/g, '\r\n');

const replace1 = `            {isSubmitting ? (
              <div className="sap-loading-card" style={{ maxWidth: 760, width: '100%', margin: '0 auto', textAlign: 'center', padding: '36px 20px' }}>
                <span className="sap-spinner" style={{ width: 36, height: 36, borderWidth: 3, marginBottom: 16 }} />
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--sap-text)', marginBottom: 8 }}>
                  Checking BOMs in SAP...
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--sap-text-muted)', maxWidth: 480, margin: '0 auto 20px' }}>
                  Simulating multi-level BOM creation in target plant via BAPI TESTRUN to verify all components and plants before execution.
                </p>
                <button
                  type="button"
                  className="sap-btn sap-btn-ghost"
                  onClick={onBack}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto' }}
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
              </div>
            ) : (`.replace(/\n/g, '\r\n');

if (!copyView.includes(target1)) {
  console.error('Target1 in CopyBomView not found');
  process.exit(1);
}

copyView = copyView.replace(target1, replace1);
fs.writeFileSync('frontend/src/components/CopyBomView.jsx', copyView, 'utf8');
console.log('CopyBomView.jsx updated successfully');

// Update BulkBomView.jsx
let bulkView = fs.readFileSync('frontend/src/components/BulkBomView.jsx', 'utf8');

const importTarget = `import activityTracker from '../services/activityTracker';`.replace(/\n/g, '\r\n');
const importReplace = `import activityTracker from '../services/activityTracker';\r\nimport BlockedReasonsList from './BlockedReasonsList';`.replace(/\n/g, '\r\n');
bulkView = bulkView.replace(importTarget, importReplace);

// Add progress banner when isValidating is true
const tableTarget = `              {/* Grid Table */}`.replace(/\n/g, '\r\n');
const tableReplace = `              {isValidating && (
                <div style={{
                  padding: '16px 20px',
                  background: 'var(--sap-surface-hover)',
                  border: '1px solid var(--sap-border)',
                  borderRadius: 'var(--sap-radius)',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="sap-spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--sap-text)' }}>
                        Checking {parsedRows.length} BOM{parsedRows.length === 1 ? '' : 's'} in SAP...
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--sap-text-muted)' }}>
                        Running multi-level simulation via SAP RFC TESTRUN across all levels.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sap-btn sap-btn-ghost sap-btn-sm"
                    onClick={onBack || resetAll}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ChevronLeft size={13} />
                    <span>Back</span>
                  </button>
                </div>
              )}

              {/* Grid Table */}`.replace(/\n/g, '\r\n');

bulkView = bulkView.replace(tableTarget, tableReplace);

// Render BlockedReasonsList in table message-cell
const msgCellTarget = `                          <td>
                            <div className="message-cell">
                              <span className="cell-msg-text">{row.message}</span>
                              {row.bomNumber && (
                                <span className="bom-num-tag">SAP BOM: {row.bomNumber}</span>
                              )}
                            </div>
                          </td>`.replace(/\n/g, '\r\n');

const msgCellReplace = `                          <td>
                            <div className="message-cell">
                              {isRowError && (row.problems?.length > 0 || (row.message && row.message.startsWith('Cannot copy:'))) ? (
                                <BlockedReasonsList
                                  problems={row.problems || row.message}
                                  totalBoms={row.totalBomsSimulated}
                                  message={row.message}
                                  compact={true}
                                />
                              ) : (
                                <span className="cell-msg-text">{row.message}</span>
                              )}
                              {row.bomNumber && (
                                <span className="bom-num-tag">SAP BOM: {row.bomNumber}</span>
                              )}
                            </div>
                          </td>`.replace(/\n/g, '\r\n');

if (!bulkView.includes(msgCellTarget)) {
  console.error('msgCellTarget in BulkBomView not found');
  process.exit(1);
}

bulkView = bulkView.replace(msgCellTarget, msgCellReplace);
fs.writeFileSync('frontend/src/components/BulkBomView.jsx', bulkView, 'utf8');
console.log('BulkBomView.jsx updated successfully');
