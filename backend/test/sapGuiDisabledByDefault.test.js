import assert from 'assert';
import {
  isSapGuiEnabled,
  connectToSapGui,
  setSelectedSapSessionId,
  getSelectedSapSessionId,
  getSelectedSapUser,
  resetSelectedSapSession
} from '../services/sapGuiClient.js';

console.log('============================================================');
console.log('  TEST: SAP GUI SCRIPTING DISABLED & PER-USER ISOLATION     ');
console.log('============================================================\n');

async function runTests() {
  // 1. GUI Scripting disabled by default
  console.log('1. Testing SAP GUI scripting flag is disabled by default:');
  delete process.env.ENABLE_SAP_GUI;
  delete process.env.SAP_GUI_ENABLED;

  assert.strictEqual(isSapGuiEnabled(), false, 'isSapGuiEnabled() must return false when env flag is unset');
  console.log('   ✓ Legacy SAP GUI Scripting flag defaults to OFF');

  // 2. Calling GUI automation throws SAP_GUI_DISABLED
  console.log('2. Testing GUI automation throws SAP_GUI_DISABLED:');
  await assert.rejects(
    async () => {
      await connectToSapGui();
    },
    (err) => {
      assert.strictEqual(err.code, 'SAP_GUI_DISABLED', 'Error code must be SAP_GUI_DISABLED');
      assert.strictEqual(err.status, 403, 'Error status must be 403');
      assert(err.message.includes('SAP GUI Scripting is legacy and disabled by default'), 'Message matches expected explanation');
      return true;
    }
  );
  console.log('   ✓ Legacy GUI automation is blocked and throws SAP_GUI_DISABLED');

  // 3. Testing per-user session isolation (no shared module-level state)
  console.log('3. Testing per-user session state isolation (User A vs User B):');
  resetSelectedSapSession();

  const userA = 'user_alice_uuid';
  const userB = 'user_bob_uuid';

  setSelectedSapSessionId('/app/con[0]/ses[0]', 'ALICE_USER', userA);
  setSelectedSapSessionId('/app/con[1]/ses[2]', 'BOB_USER', userB);

  assert.strictEqual(getSelectedSapSessionId(userA), '/app/con[0]/ses[0]', "User A's session ID must be isolated");
  assert.strictEqual(getSelectedSapUser(userA), 'ALICE_USER', "User A's username must be isolated");

  assert.strictEqual(getSelectedSapSessionId(userB), '/app/con[1]/ses[2]', "User B's session ID must be isolated");
  assert.strictEqual(getSelectedSapUser(userB), 'BOB_USER', "User B's username must be isolated");

  resetSelectedSapSession(userA);
  assert.strictEqual(getSelectedSapSessionId(userA), null, "User A's session must be cleared");
  assert.strictEqual(getSelectedSapSessionId(userB), '/app/con[1]/ses[2]', "User B's session must remain untouched");
  console.log('   ✓ User A and User B session state strictly isolated per userId');

  // 4. Test explicit opt-in enables the flag
  console.log('4. Testing explicit ENABLE_SAP_GUI flag:');
  process.env.ENABLE_SAP_GUI = 'true';
  assert.strictEqual(isSapGuiEnabled(), true, 'ENABLE_SAP_GUI=true enables the flag');
  delete process.env.ENABLE_SAP_GUI;

  console.log('\n============================================================');
  console.log('✅ ALL SAP GUI SCRIPTING ISOLATION TESTS PASSED!             ');
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error in sapGuiDisabledByDefault test:', err);
  process.exit(1);
});
