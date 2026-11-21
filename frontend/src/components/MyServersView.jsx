import React, { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Star,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Radio
} from 'lucide-react';
import AddServerModal from './AddServerModal';
import Modal from './ui/Modal';
import { Button } from './ui/button';
import FioriPageHeader from './FioriPageHeader';
import { PageContainer } from './layout';
import { toast } from '../context/ToastContext';
import { getMyServers, deleteMyServer, setMyDefaultServer, testServerConnection } from '../services/api';

export default function MyServersView({ onServerChanged, onNavigateHome }) {
  const [servers, setServers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState(null);
  const [serverToDelete, setServerToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Per-server testing state: serverId -> { isTesting, result }
  const [testStates, setTestStates] = useState({});

  const loadServers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getMyServers();
      setServers(data || []);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load servers.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleSetDefault = async (serverId) => {
    try {
      await setMyDefaultServer(serverId);
      toast.success('Default server updated.');
      setSuccessMessage('Default server updated.');
      await loadServers();
      if (typeof onServerChanged === 'function') {
        onServerChanged();
      }
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to set default server.');
      setError(err?.response?.data?.error || err.message || 'Failed to set default server.');
    }
  };

  const handleTestServer = async (server) => {
    setTestStates((prev) => ({
      ...prev,
      [server.id]: { isTesting: true, result: null }
    }));

    try {
      const res = await testServerConnection({}, server.id);
      const isSuccess = Boolean(res?.success);
      const successMsg = res?.message || `Connected (${res.responseTimeMs || 0} ms)`;
      const failMsg = res?.error || res?.message || 'Connection test failed';

      setTestStates((prev) => ({
        ...prev,
        [server.id]: {
          isTesting: false,
          result: {
            success: isSuccess,
            message: isSuccess ? successMsg : failMsg
          }
        }
      }));

      if (isSuccess) {
        toast.success(successMsg);
      } else {
        toast.error(failMsg);
      }

      // Update local server state to reflect new live health
      setServers((prevServers) =>
        prevServers.map((s) =>
          s.id === server.id
            ? {
                ...s,
                health_status: isSuccess ? 'healthy' : 'down',
                circuit_breaker: isSuccess ? 'closed' : 'open',
                last_error: isSuccess ? null : (res?.error || res?.message || 'Connection failed')
              }
            : s
        )
      );

      // Broadcast update so top bar dot updates in sync
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sap:server-status', {
            detail: {
              connected: isSuccess,
              status: isSuccess ? 'AVAILABLE' : 'UNREACHABLE',
              code: isSuccess ? 'AVAILABLE' : (res?.code || 'SAP_UNREACHABLE'),
              reason: isSuccess ? 'Connected' : (res?.error || res?.message || 'SAP server not reachable'),
              latencyMs: res.responseTimeMs,
              serverId: server.id
            }
          })
        );
      }
    } catch (err) {
      const errMsg = err?.response?.data?.error || err.message || 'Test failed';
      const errCode = err?.response?.data?.code || 'TEST_FAILED';
      toast.error(errMsg);
      setTestStates((prev) => ({
        ...prev,
        [server.id]: {
          isTesting: false,
          result: {
            success: false,
            message: errMsg
          }
        }
      }));

      setServers((prevServers) =>
        prevServers.map((s) =>
          s.id === server.id
            ? {
                ...s,
                health_status: 'down',
                circuit_breaker: 'open',
                last_error: errMsg,
                last_code: errCode
              }
            : s
        )
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sap:server-status', {
            detail: {
              connected: false,
              status: 'UNREACHABLE',
              code: errCode,
              reason: errMsg,
              serverId: server.id
            }
          })
        );
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!serverToDelete) return;
    setIsDeleting(true);
    try {
      await deleteMyServer(serverToDelete.id);
      setSuccessMessage(`Server "${serverToDelete.name}" deleted.`);
      setServerToDelete(null);
      await loadServers();
      if (typeof onServerChanged === 'function') {
        onServerChanged();
      }
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to delete server.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatEnv = (env) => {
    const clean = String(env || 'Sandbox').toUpperCase();
    if (clean === 'PROD' || clean === 'PRODUCTION') return 'Production';
    if (clean === 'DEV' || clean === 'DEVELOPMENT') return 'Development';
    if (clean === 'QA') return 'QA';
    return 'Sandbox';
  };

  return (
    <div className="fiori-app-view-root" style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
      <FioriPageHeader
        title="My SAP Servers"
        subtitle="Add and manage your own SAP servers. Your SAP passwords are encrypted and never shown in the app."
        breadcrumbs={[
          { label: 'Home', onClick: onNavigateHome },
          { label: 'My Servers' }
        ]}
        extraTitleContent={
          <button
            type="button"
            className="sap-btn sap-btn-primary fiori-ph-btn"
            onClick={() => {
              setServerToEdit(null);
              setIsAddModalOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--color-navy-900)',
              color: 'var(--color-text-inverse)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} />
            <span>Add Server</span>
          </button>
        }
      />

      <PageContainer
        className="rx-my-servers-container"
        style={{
          width: '100%',
          overflowX: 'hidden',
          paddingTop: '24px',
          paddingBottom: '32px'
        }}
      >

      {/* Notifications */}
      {successMessage && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-success-bg)',
            border: '1px solid var(--color-success-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: '16px',
            color: 'var(--color-success)',
            fontSize: '13px'
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: '16px',
            color: 'var(--color-danger)',
            fontSize: '13px'
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: '13px' }}>Loading your SAP servers...</p>
        </div>
      ) : servers.length === 0 ? (
        <div
          className="rx-empty-servers-card"
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--color-border)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-blue-100)',
              color: 'var(--color-navy-900)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}
          >
            <Server size={28} />
          </div>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--color-text)',
              margin: '0 0 6px 0'
            }}
          >
            No SAP servers configured yet
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-text-muted)',
              maxWidth: '440px',
              margin: '0 auto 20px auto',
              lineHeight: 1.5
            }}
          >
            Add your personal SAP server details to connect to corporate SAP environments and execute BOM operations.
          </p>
          <button
            type="button"
            onClick={() => {
              setServerToEdit(null);
              setIsAddModalOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--color-navy-900)',
              color: 'var(--color-text-inverse)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} />
            Add Server
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table
              style={{
                width: '100%',
                minWidth: '760px',
                tableLayout: 'fixed',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px'
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--table-header-bg)',
                    borderBottom: '1px solid var(--table-header-border)',
                    color: 'var(--table-header-text)',
                    fontWeight: 600,
                    height: 'var(--size-table-header-height)'
                  }}
                >
                  <th style={{ width: '60px', padding: '0 var(--space-16)' }}>Default</th>
                  <th style={{ width: '180px', padding: '0 var(--space-16)' }}>Server Name</th>
                  <th style={{ width: '160px', padding: '0 var(--space-16)' }}>Host / IP</th>
                  <th style={{ width: '65px', padding: '0 var(--space-16)' }}>Sys #</th>
                  <th style={{ width: '75px', padding: '0 var(--space-16)' }}>Client</th>
                  <th style={{ width: '130px', padding: '0 var(--space-16)' }}>Type</th>
                  <th style={{ width: '130px', padding: '0 var(--space-16)' }}>Status</th>
                  <th style={{ width: '150px', padding: '0 var(--space-16)', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => {
                  const srvType = formatEnv(server.type || server.environment);
                  const isProd = srvType === 'Production';
                  const testState = testStates[server.id] || {};

                  return (
                    <tr
                      key={server.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: server.is_default ? 'var(--color-blue-50)' : 'transparent'
                      }}
                    >
                      {/* Default Radio */}
                      <td style={{ width: '60px', padding: '12px 16px' }}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={Boolean(server.is_default)}
                          onClick={() => !server.is_default && handleSetDefault(server.id)}
                          title="Set as default"
                          aria-label={server.is_default ? `Default server: ${server.name}` : `Set ${server.name} as default`}
                          className="focus-visible:ring-2 focus-visible:ring-[var(--color-blue-600)] focus-visible:ring-offset-1 focus:outline-none"
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: server.is_default
                              ? '1.5px solid var(--color-navy-900)'
                              : '1.5px solid var(--color-border)',
                            backgroundColor: 'var(--color-surface)',
                            cursor: server.is_default ? 'default' : 'pointer',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        >
                          {server.is_default && (
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--color-navy-900)'
                              }}
                            />
                          )}
                        </button>
                      </td>

                      {/* Server Name */}
                      <td style={{ width: '180px', padding: '12px 16px', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span title={server.name}>{server.name}</span>
                        {server.is_default && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '11px',
                              fontWeight: 500,
                              color: 'var(--color-blue-700)',
                              backgroundColor: 'var(--color-blue-100)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            Default
                          </span>
                        )}
                      </td>

                      {/* Host */}
                      <td style={{ width: '160px', padding: '12px 16px', fontFamily: 'monospace', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span title={server.ashost}>{server.ashost}</span>
                      </td>

                      {/* Sysnr */}
                      <td style={{ width: '65px', padding: '12px 16px', color: 'var(--color-text-muted)' }}>
                        {server.sysnr}
                      </td>

                      {/* Client */}
                      <td style={{ width: '75px', padding: '12px 16px', color: 'var(--color-text-muted)' }}>
                        {server.client}
                      </td>

                      {/* Type (Read-only Badge from Allowlist) */}
                      <td style={{ width: '130px', padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-badge)',
                            backgroundColor: isProd ? 'var(--color-danger)' : 'var(--color-blue-100)',
                            color: isProd ? 'var(--color-surface)' : 'var(--color-navy-900)',
                            border: isProd ? '1px solid var(--color-danger)' : '1px solid var(--color-blue-200)'
                          }}
                        >
                          {srvType}
                        </span>
                      </td>

                      {/* Health / Test Result */}
                      <td
                        style={{
                          padding: '12px 16px',
                          width: '130px',
                          maxWidth: '130px',
                          overflow: 'hidden',
                          boxSizing: 'border-box'
                        }}
                      >
                        {(() => {
                          if (testState.isTesting) {
                            return (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  color: 'var(--color-text-muted)',
                                  fontSize: '12px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%'
                                }}
                                title="Testing connection to SAP server..."
                              >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-text-muted)', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Testing...</span>
                              </span>
                            );
                          }

                          if (testState.result) {
                            const isSuccess = Boolean(testState.result.success);
                            const dotColor = isSuccess ? 'var(--color-success)' : 'var(--color-danger)';
                            const label = isSuccess ? 'Ready' : 'Unreachable';
                            const tooltip = testState.result.message || (isSuccess ? 'Connected' : 'Connection failed');

                            return (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  color: 'var(--color-text-muted)',
                                  fontSize: '12px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%'
                                }}
                                title={tooltip}
                                data-testid={`server-status-${server.id}`}
                              >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                              </span>
                            );
                          }

                          const isDown = server.is_disabled || server.health_status === 'down' || server.circuit_breaker === 'open';
                          const isDegraded = !isDown && server.health_status === 'degraded';
                          const dotColor = server.is_disabled
                            ? 'var(--color-text-muted)'
                            : isDown
                            ? 'var(--color-danger)'
                            : isDegraded
                            ? 'var(--color-warning)'
                            : 'var(--color-success)';
                          const label = server.is_disabled
                            ? 'Disabled'
                            : isDown
                            ? 'Unreachable'
                            : isDegraded
                            ? 'Degraded'
                            : 'Ready';
                          const title = server.is_disabled
                            ? 'This SAP server is disabled.'
                            : (server.last_error || (isDown ? 'SAP server not reachable' : 'Connected and ready'));

                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: 'var(--color-text-muted)',
                                fontSize: '12px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%'
                              }}
                              title={title}
                              data-testid={`server-status-${server.id}`}
                            >
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', width: '150px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleTestServer(server)}
                            disabled={testState.isTesting}
                            title="Test Connection"
                            style={{
                              width: '56px',
                              height: '28px',
                              padding: '4px 6px',
                              fontSize: '12px',
                              fontWeight: 500,
                              backgroundColor: 'transparent',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-md)',
                              cursor: testState.isTesting ? 'not-allowed' : 'pointer',
                              color: 'var(--color-text)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxSizing: 'border-box'
                            }}
                          >
                            {testState.isTesting ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              'Test'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setServerToEdit(server);
                              setIsAddModalOpen(true);
                            }}
                            title="Edit Server"
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: 0,
                              fontSize: '12px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-md)',
                              cursor: 'pointer',
                              color: 'var(--color-text)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxSizing: 'border-box'
                            }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setServerToDelete(server)}
                            title="Delete Server"
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: 0,
                              fontSize: '12px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--color-danger-border)',
                              borderRadius: 'var(--radius-md)',
                              cursor: 'pointer',
                              color: 'var(--color-danger)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxSizing: 'border-box'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Server Modal */}
      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setServerToEdit(null);
        }}
        onSuccess={async (savedServer) => {
          setSuccessMessage(serverToEdit ? 'Server updated successfully.' : 'Server created successfully.');
          await loadServers();
          if (typeof onServerChanged === 'function') {
            onServerChanged(savedServer);
          }
          setTimeout(() => setSuccessMessage(''), 3000);
        }}
        serverToEdit={serverToEdit}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(serverToDelete)}
        onClose={() => setServerToDelete(null)}
        title="Delete SAP Server"
        maxWidth="440px"
        isLoading={isDeleting}
        icon={Trash2}
        footer={
          <>
            <Button variant="secondary" onClick={() => setServerToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} isLoading={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete Server'}
            </Button>
          </>
        }
      >
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.5 }}>
          Are you sure you want to delete server <strong>{serverToDelete?.name}</strong> ({serverToDelete?.ashost})?
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
          This will remove your configured connection and stored SAP credentials. Active jobs using this server will be cancelled.
        </p>
      </Modal>
    </PageContainer>
  </div>
  );
}
