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
      setSuccessMessage('Default server updated.');
      await loadServers();
      if (typeof onServerChanged === 'function') {
        onServerChanged();
      }
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
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
      setTestStates((prev) => ({
        ...prev,
        [server.id]: {
          isTesting: false,
          result: {
            success: Boolean(res?.success),
            message: res?.success
              ? `Connected (${res.responseTimeMs || 0} ms)`
              : (res?.error || res?.message || 'Failed')
          }
        }
      }));
    } catch (err) {
      setTestStates((prev) => ({
        ...prev,
        [server.id]: {
          isTesting: false,
          result: {
            success: false,
            message: err?.response?.data?.error || err.message || 'Test failed'
          }
        }
      }));
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
    <div
      className="rx-my-servers-container"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: 'var(--spacing-xl, 24px) var(--spacing-lg, 16px)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-lg, 24px)',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--color-text, #0F172A)',
              margin: '0 0 4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Server size={22} color="var(--color-navy-900, #00204E)" />
            My SAP Servers
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-text-muted, #64748B)',
              margin: 0
            }}
          >
            Configure your personal SAP connection credentials. Password secrets are encrypted with AES-256-GCM.
          </p>
        </div>

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
            padding: '9px 16px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: 'var(--color-navy-900, #00204E)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 'var(--radius-md, 6px)',
            cursor: 'pointer'
          }}
        >
          <Plus size={16} />
          Add Server
        </button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-success-bg, #F0FDF4)',
            border: '1px solid var(--color-success-border, #86EFAC)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '10px 14px',
            marginBottom: '16px',
            color: 'var(--color-success, #166534)',
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
            backgroundColor: 'var(--color-danger-bg, #FEF2F2)',
            border: '1px solid var(--color-danger-border, #FCA5A5)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '10px 14px',
            marginBottom: '16px',
            color: 'var(--color-danger, #B42318)',
            fontSize: '13px'
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted, #64748B)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: '13px' }}>Loading your SAP servers...</p>
        </div>
      ) : servers.length === 0 ? (
        <div
          className="rx-empty-servers-card"
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: 'var(--radius-lg, 8px)',
            border: '1px dashed var(--color-border, #CBD5E1)',
            boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.05))'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-blue-100, #DCE8F1)',
              color: 'var(--color-navy-900, #00204E)',
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
              color: 'var(--color-text, #0F172A)',
              margin: '0 0 6px 0'
            }}
          >
            No SAP servers configured yet
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-text-muted, #64748B)',
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
              backgroundColor: 'var(--color-navy-900, #00204E)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 'var(--radius-md, 6px)',
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
            backgroundColor: 'var(--color-surface, #FFFFFF)',
            borderRadius: 'var(--radius-lg, 8px)',
            border: '1px solid var(--color-border, #E2E8F0)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.05))'
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--color-surface-subtle, #F8FAFC)',
                    borderBottom: '1px solid var(--color-border, #E2E8F0)',
                    color: 'var(--color-text-muted, #64748B)',
                    fontWeight: 600
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>Default</th>
                  <th style={{ padding: '12px 16px' }}>Server Name</th>
                  <th style={{ padding: '12px 16px' }}>Host / IP</th>
                  <th style={{ padding: '12px 16px' }}>Sys #</th>
                  <th style={{ padding: '12px 16px' }}>Client</th>
                  <th style={{ padding: '12px 16px' }}>Type (Allowlist)</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
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
                        borderBottom: '1px solid var(--color-border, #E2E8F0)',
                        backgroundColor: server.is_default ? 'var(--color-blue-50, #F0F6FA)' : 'transparent'
                      }}
                    >
                      {/* Default Radio / Star */}
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          type="button"
                          onClick={() => handleSetDefault(server.id)}
                          title={server.is_default ? 'Default server' : 'Set as default server'}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            color: server.is_default ? 'var(--color-accent, #EAB308)' : 'var(--color-text-muted, #94A3B8)'
                          }}
                        >
                          <Star size={18} fill={server.is_default ? 'currentColor' : 'none'} />
                        </button>
                      </td>

                      {/* Server Name */}
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text, #0F172A)' }}>
                        {server.name}
                        {server.is_default && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '11px',
                              fontWeight: 500,
                              color: 'var(--color-blue-700, #1D4ED8)',
                              backgroundColor: 'var(--color-blue-100, #DCE8F1)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            Default
                          </span>
                        )}
                      </td>

                      {/* Host */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--color-text, #0F172A)' }}>
                        {server.ashost}
                      </td>

                      {/* Sysnr */}
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748B)' }}>
                        {server.sysnr}
                      </td>

                      {/* Client */}
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748B)' }}>
                        {server.client}
                      </td>

                      {/* Type (Read-only Badge from Allowlist) */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-badge, 4px)',
                            backgroundColor: isProd ? 'var(--color-danger, #B42318)' : 'var(--color-blue-100, #DCE8F1)',
                            color: isProd ? '#FFFFFF' : 'var(--color-navy-900, #00204E)',
                            border: isProd ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-blue-300, #98B5CE)'
                          }}
                        >
                          {srvType}
                        </span>
                      </td>

                      {/* Health / Test Result */}
                      <td style={{ padding: '12px 16px' }}>
                        {testState.isTesting ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted, #64748B)', fontSize: '12px' }}>
                            <RefreshCw size={12} className="animate-spin" /> Testing...
                          </span>
                        ) : testState.result ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              color: testState.result.success ? 'var(--color-success, #166534)' : 'var(--color-danger, #B42318)'
                            }}
                          >
                            {testState.result.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                            {testState.result.message}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted, #64748B)', fontSize: '12px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success, #166534)' }} />
                            Ready
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleTestServer(server)}
                            disabled={testState.isTesting}
                            title="Test Connection"
                            style={{
                              padding: '5px 8px',
                              fontSize: '12px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--color-border, #CBD5E1)',
                              borderRadius: 'var(--radius-md, 4px)',
                              cursor: 'pointer',
                              color: 'var(--color-text, #0F172A)'
                            }}
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setServerToEdit(server);
                              setIsAddModalOpen(true);
                            }}
                            title="Edit Server"
                            style={{
                              padding: '5px 8px',
                              fontSize: '12px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--color-border, #CBD5E1)',
                              borderRadius: 'var(--radius-md, 4px)',
                              cursor: 'pointer',
                              color: 'var(--color-text, #0F172A)'
                            }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setServerToDelete(server)}
                            title="Delete Server"
                            style={{
                              padding: '5px 8px',
                              fontSize: '12px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--color-danger-border, #FCA5A5)',
                              borderRadius: 'var(--radius-md, 4px)',
                              cursor: 'pointer',
                              color: 'var(--color-danger, #B42318)'
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
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
            <button
              type="button"
              onClick={() => setServerToDelete(null)}
              disabled={isDeleting}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                backgroundColor: 'transparent',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: 'var(--radius-md, 6px)',
                cursor: isDeleting ? 'not-allowed' : 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: 'var(--color-danger, #B42318)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 'var(--radius-md, 6px)',
                cursor: isDeleting ? 'not-allowed' : 'pointer'
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete Server'}
            </button>
          </div>
        }
      >
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--color-text, #0F172A)', lineHeight: 1.5 }}>
          Are you sure you want to delete server <strong>{serverToDelete?.name}</strong> ({serverToDelete?.ashost})?
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted, #64748B)', lineHeight: 1.4 }}>
          This will remove your configured connection and stored SAP credentials. Active jobs using this server will be cancelled.
        </p>
      </Modal>
    </div>
  );
}
