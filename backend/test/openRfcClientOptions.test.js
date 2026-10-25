import assert from 'assert';
import { Client } from 'open-rfc';
import {
  openRfcClient,
  DEFAULT_RFC_CLIENT_OPTIONS,
  getRfcConnectionParams
} from '../services/sapRfcClient.js';

async function runTests() {
  console.log('\n================================================================');
  console.log('--- open-rfc Client Options & recursiveSerializerPolicy Test Suite ---');
  console.log('================================================================\n');

  // 1. Verify DEFAULT_RFC_CLIENT_OPTIONS structure
  console.log('1. Verify DEFAULT_RFC_CLIENT_OPTIONS configuration:');
  {
    assert.ok(DEFAULT_RFC_CLIENT_OPTIONS, 'DEFAULT_RFC_CLIENT_OPTIONS should be defined');
    assert.strictEqual(DEFAULT_RFC_CLIENT_OPTIONS.bcd, 'string', 'bcd mode should remain string');
    assert.strictEqual(DEFAULT_RFC_CLIENT_OPTIONS.int8Mode, 'number', 'int8Mode should remain number');

    const policy = DEFAULT_RFC_CLIENT_OPTIONS.recursiveSerializerPolicy;
    assert.ok(policy, 'recursiveSerializerPolicy must be present');
    assert.strictEqual(policy.profile, 'abap-7.50', 'profile must be abap-7.50');
    assert.ok(policy.observation, 'observation must be present');
    assert.strictEqual(
      policy.observation.defaultSerializer,
      'classic-xrfc',
      'defaultSerializer must be classic-xrfc'
    );
    assert.strictEqual(
      policy.observation.basxmlDisabledSerializer,
      'classic-xrfc',
      'basxmlDisabledSerializer must be classic-xrfc'
    );
    console.log('   ✓ DEFAULT_RFC_CLIENT_OPTIONS matches required recursiveSerializerPolicy structure');
  }

  // 2. Test openRfcClient passes DEFAULT_RFC_CLIENT_OPTIONS to Client constructor
  console.log('\n2. Test openRfcClient passes DEFAULT_RFC_CLIENT_OPTIONS to mocked client:');
  {
    let capturedParams = null;
    let capturedOptions = null;
    let openCalled = false;

    class MockClient {
      constructor(params, options) {
        capturedParams = params;
        capturedOptions = options;
      }

      async open() {
        openCalled = true;
      }

      async close() {}
    }

    const testServer = {
      ashost: '192.168.1.100',
      sysnr: '00',
      client: '100',
      sap_username: 'TEST_USER',
      sap_password: 'TEST_PASSWORD'
    };

    const clientInstance = await openRfcClient(testServer, MockClient);

    assert.ok(openCalled, 'client.open() must be called');
    assert.ok(clientInstance instanceof MockClient, 'Must return instance of client');
    assert.ok(capturedParams, 'Connection parameters must be passed');
    assert.strictEqual(capturedParams.user, 'TEST_USER');
    assert.strictEqual(capturedParams.passwd, 'TEST_PASSWORD');
    assert.strictEqual(
      capturedOptions,
      DEFAULT_RFC_CLIENT_OPTIONS,
      'DEFAULT_RFC_CLIENT_OPTIONS must be passed to Client constructor'
    );
    console.log('   ✓ MockClient captured exact DEFAULT_RFC_CLIENT_OPTIONS on instantiation');
  }

  // 3. Test open-rfc real Client successfully accepts DEFAULT_RFC_CLIENT_OPTIONS
  console.log('\n3. Test open-rfc real Client accepts DEFAULT_RFC_CLIENT_OPTIONS:');
  {
    const connParams = {
      ashost: '127.0.0.1',
      sysnr: '00',
      client: '100',
      user: 'MOCKUSER',
      passwd: 'MOCKPASSWORD'
    };

    const realClient = new Client(connParams, DEFAULT_RFC_CLIENT_OPTIONS);
    const parsedOptions = realClient.config.clientOptions;

    assert.ok(parsedOptions, 'clientOptions must be parsed in real Client.config');
    assert.strictEqual(parsedOptions.bcd, 'string');
    assert.strictEqual(parsedOptions.int8Mode, 'number');
    assert.strictEqual(parsedOptions.recursiveSerializerPolicy.profile, 'abap-7.50');
    assert.strictEqual(
      parsedOptions.recursiveSerializerPolicy.observation.defaultSerializer,
      'classic-xrfc'
    );
    assert.strictEqual(
      parsedOptions.recursiveSerializerPolicy.observation.basxmlDisabledSerializer,
      'classic-xrfc'
    );
    console.log('   ✓ Real open-rfc Client successfully parses and validates DEFAULT_RFC_CLIENT_OPTIONS');
  }

  console.log('\n================================================================');
  console.log('✅ ALL OPEN-RFC CLIENT OPTIONS TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
