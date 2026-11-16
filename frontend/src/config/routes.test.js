import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTES,
  ROUTE_IDS,
  normalizePath,
  isInternalPath,
  isKnownRoute,
  isProtectedRoute,
  isAuthRoute,
  saveIntendedPath,
  popIntendedPath,
  clearIntendedPath
} from './routes.js';

describe('Clean Routing & URL Helpers', () => {
  beforeEach(() => {
    clearIntendedPath();
  });

  describe('isInternalPath', () => {
    it('accepts valid internal paths', () => {
      assert.equal(isInternalPath('/home'), true);
      assert.equal(isInternalPath('/products/bom'), true);
      assert.equal(isInternalPath('/admin/users'), true);
    });

    it('rejects external URLs and protocol-relative URLs', () => {
      assert.equal(isInternalPath('https://evil.com'), false);
      assert.equal(isInternalPath('http://evil.com'), false);
      assert.equal(isInternalPath('//evil.com'), false);
      assert.equal(isInternalPath('javascript:alert(1)'), false);
      assert.equal(isInternalPath(''), false);
      assert.equal(isInternalPath(null), false);
    });
  });

  describe('isKnownRoute and isProtectedRoute', () => {
    it('recognizes root / as known but not protected', () => {
      assert.equal(isKnownRoute('/'), true);
      assert.equal(isProtectedRoute('/'), false);
    });

    it('recognizes /signin and public routes as known and not protected', () => {
      assert.equal(isKnownRoute('/signin'), true);
      assert.equal(isProtectedRoute('/signin'), false);
      assert.equal(isAuthRoute('/signin'), true);

      assert.equal(isKnownRoute('/404'), true);
      assert.equal(isProtectedRoute('/404'), false);

      assert.equal(isKnownRoute('/access-denied'), true);
      assert.equal(isProtectedRoute('/access-denied'), false);
    });

    it('recognizes protected routes', () => {
      assert.equal(isKnownRoute('/home'), true);
      assert.equal(isProtectedRoute('/home'), true);

      assert.equal(isKnownRoute('/products/bom/create/single'), true);
      assert.equal(isProtectedRoute('/products/bom/create/single'), true);

      assert.equal(isKnownRoute('/admin/users'), true);
      assert.equal(isProtectedRoute('/admin/users'), true);
    });

    it('recognizes legacy redirects as known and protected when target is protected', () => {
      assert.equal(isKnownRoute('/create_bom'), true);
      assert.equal(isProtectedRoute('/create_bom'), true);
    });

    it('recognizes unknown URLs as neither known nor protected', () => {
      assert.equal(isKnownRoute('/unknown-path'), false);
      assert.equal(isProtectedRoute('/unknown-path'), false);

      assert.equal(isKnownRoute('/some/deep/fake/route'), false);
      assert.equal(isProtectedRoute('/some/deep/fake/route'), false);
    });
  });

  describe('Intended Return Path Management (sessionStorage & in-memory)', () => {
    it('saves and pops a valid internal protected path', () => {
      saveIntendedPath('/products/bom/create/single');
      const popped = popIntendedPath();
      assert.equal(popped, '/products/bom/create/single');

      // Second pop should be null (single-use)
      assert.equal(popIntendedPath(), null);
    });

    it('strips query parameters when saving intended path', () => {
      saveIntendedPath('/products/bom/display?material=100');
      const popped = popIntendedPath();
      assert.equal(popped, '/products/bom/display');
    });

    it('refuses to save auth routes or root as intended path', () => {
      saveIntendedPath('/signin');
      assert.equal(popIntendedPath(), null);

      saveIntendedPath('/');
      assert.equal(popIntendedPath(), null);
    });

    it('refuses to save external or protocol-relative URLs', () => {
      saveIntendedPath('//attacker.com');
      assert.equal(popIntendedPath(), null);

      saveIntendedPath('https://attacker.com/evil');
      assert.equal(popIntendedPath(), null);
    });

    it('clears intended path on demand', () => {
      saveIntendedPath('/admin/users');
      clearIntendedPath();
      assert.equal(popIntendedPath(), null);
    });
  });
});
