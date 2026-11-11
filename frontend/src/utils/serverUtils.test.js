import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getNewestActiveServer } from './serverUtils.js';

describe('Top-bar Default Server Selection (getNewestActiveServer)', () => {
  const serverOld = {
    id: 'srv-1',
    name: 'Server Old',
    environment: 'DEV',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z'
  };

  const serverMid = {
    id: 'srv-2',
    name: 'Server Mid',
    environment: 'SANDBOX',
    is_active: true,
    created_at: '2026-02-20T00:00:00Z'
  };

  const serverNewest = {
    id: 'srv-3',
    name: 'Server Newest',
    environment: 'PROD',
    is_active: true,
    created_at: '2026-03-15T00:00:00Z'
  };

  it('selects the newest accessible active server among 3 servers with different creation dates', () => {
    const servers = [serverOld, serverNewest, serverMid];
    const selected = getNewestActiveServer(servers);
    assert.ok(selected);
    assert.equal(selected.id, 'srv-3');
    assert.equal(selected.name, 'Server Newest');
  });

  it('selects the next newest active server if the newest is disabled', () => {
    const disabledNewest = { ...serverNewest, is_active: false };
    const servers = [serverOld, disabledNewest, serverMid];
    const selected = getNewestActiveServer(servers);
    assert.ok(selected);
    assert.equal(selected.id, 'srv-2');
    assert.equal(selected.name, 'Server Mid');
  });

  it('selects the next newest active server if the user has no access to the newest', () => {
    // User only has access to serverOld and serverMid (serverNewest omitted from accessible servers)
    const accessibleServers = [serverOld, serverMid];
    const selected = getNewestActiveServer(accessibleServers);
    assert.ok(selected);
    assert.equal(selected.id, 'srv-2');
    assert.equal(selected.name, 'Server Mid');
  });

  it('falls back to the highest id if servers do not have created_at', () => {
    const serversNoDates = [
      { id: 'srv-1', name: 'S1', is_active: true },
      { id: 'srv-10', name: 'S10', is_active: true },
      { id: 'srv-2', name: 'S2', is_active: true }
    ];
    const selected = getNewestActiveServer(serversNoDates);
    assert.ok(selected);
    assert.equal(selected.id, 'srv-10');
  });
});
