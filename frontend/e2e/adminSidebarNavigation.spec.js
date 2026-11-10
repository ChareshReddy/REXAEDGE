import { test, expect } from '@playwright/test';
import { setupMocks, mockNormalUser } from './helpers/mockApi.js';

test.describe('Admin Sidebar Navigation & Deep Linking Suite', () => {
  test('Admin user: click each of the 4 sidebar items in sequence, verify URL, header, sidebar active, and breadcrumbs', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/home', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-sidebar', { state: 'visible' });

    // Verify Admin group is visible in sidebar
    const adminGroupBtn = page.locator('button[aria-label="Enterprise Admin"], button[aria-label="Admin"]');
    await expect(adminGroupBtn).toBeVisible();

    // Ensure Admin group is expanded
    const isExpanded = await adminGroupBtn.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await adminGroupBtn.click();
    }

    const items = [
      {
        name: 'Users',
        id: 'admin_users',
        expectedPath: '/admin/users',
        title: 'Users',
        breadcrumbItem: 'Users'
      },
      {
        name: 'Servers',
        id: 'admin_servers',
        expectedPath: '/admin/servers',
        title: 'Servers',
        breadcrumbItem: 'Servers'
      },
      {
        name: 'Permissions',
        id: 'admin_permissions',
        expectedPath: '/admin/permissions',
        title: 'Permissions',
        breadcrumbItem: 'Permissions'
      },
      {
        name: 'Logs',
        id: 'admin_logs',
        expectedPath: '/admin/logs/audit',
        title: 'Logs',
        breadcrumbItem: 'Logs'
      }
    ];

    for (const item of items) {
      // Find the sidebar item button
      const itemBtn = page.locator(`button[aria-label="Admin: ${item.name}"]`);
      await expect(itemBtn).toBeVisible();
      await itemBtn.click();

      // 1. Verify URL matches
      await expect(page).toHaveURL(new RegExp(item.expectedPath));

      // 2. Verify Page Header title
      const pageTitle = page.locator('.fiori-ph-title');
      await expect(pageTitle).toHaveText(item.title);

      // 3. Verify Breadcrumbs: Home / Admin / <Page>
      const breadcrumb = page.locator('.fiori-bc');
      await expect(breadcrumb).toBeVisible();
      const bcText = await breadcrumb.innerText();
      expect(bcText).toContain('Home');
      expect(bcText).toContain('Admin');
      expect(bcText).toContain(item.breadcrumbItem);

      // 4. Verify Sidebar marks that item as active
      await expect(itemBtn).toHaveAttribute('aria-current', 'page');
    }
  });

  test('Browser back and forward update the view and sidebar state', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/admin/users', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-sidebar', { state: 'visible' });

    // Navigate to Servers
    const serversBtn = page.locator('button[aria-label="Admin: Servers"]');
    await serversBtn.click();
    await expect(page).toHaveURL(/\/admin\/servers/);
    await expect(page.locator('.fiori-ph-title')).toHaveText('Servers');
    await expect(serversBtn).toHaveAttribute('aria-current', 'page');

    // Navigate to Permissions
    const permsBtn = page.locator('button[aria-label="Admin: Permissions"]');
    await permsBtn.click();
    await expect(page).toHaveURL(/\/admin\/permissions/);
    await expect(page.locator('.fiori-ph-title')).toHaveText('Permissions');
    await expect(permsBtn).toHaveAttribute('aria-current', 'page');

    // Go Back -> should land on Servers
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/servers/);
    await expect(page.locator('.fiori-ph-title')).toHaveText('Servers');
    await expect(page.locator('button[aria-label="Admin: Servers"]')).toHaveAttribute('aria-current', 'page');

    // Go Back -> should land on Users
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.locator('.fiori-ph-title')).toHaveText('Users');
    await expect(page.locator('button[aria-label="Admin: Users"]')).toHaveAttribute('aria-current', 'page');

    // Go Forward -> should land on Servers
    await page.goForward();
    await expect(page).toHaveURL(/\/admin\/servers/);
    await expect(page.locator('.fiori-ph-title')).toHaveText('Servers');
    await expect(page.locator('button[aria-label="Admin: Servers"]')).toHaveAttribute('aria-current', 'page');
  });

  test('Direct load and reload on each of the 4 URLs lands on the correct page', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    await setupMocks(page, { authenticated: true, role: 'admin' });

    const urls = [
      { path: '/admin/users', name: 'Users' },
      { path: '/admin/servers', name: 'Servers' },
      { path: '/admin/permissions', name: 'Permissions' },
      { path: '/admin/logs/audit', name: 'Logs' }
    ];

    for (const u of urls) {
      await page.goto(u.path, { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(new RegExp(u.path));
      await expect(page.locator('.fiori-ph-title')).toHaveText(u.name);

      if (viewportWidth >= 900) {
        const activeBtn = page.locator(`button[aria-label="Admin: ${u.name}"]`);
        await expect(activeBtn).toBeVisible();
        await expect(activeBtn).toHaveAttribute('aria-current', 'page');
      }

      // Verify breadcrumb
      const bc = page.locator('.fiori-bc');
      const text = await bc.innerText();
      expect(text).toContain('Home');
      expect(text).toContain('Admin');
      expect(text).toContain(u.name);

      // Reload test
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page).toHaveURL(new RegExp(u.path));
      await expect(page.locator('.fiori-ph-title')).toHaveText(u.name);
      if (viewportWidth >= 900) {
        await expect(page.locator(`button[aria-label="Admin: ${u.name}"]`)).toHaveAttribute('aria-current', 'page');
      }
    }
  });

  test('Collapsed sidebar flyout click navigates to each page', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/home', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rx-sidebar', { state: 'visible' });

    // Collapse sidebar
    const collapseToggle = page.locator('button[aria-label="Collapse sidebar"]');
    await collapseToggle.click();
    await expect(page.locator('.rx-sidebar-collapsed')).toBeVisible();

    const targets = [
      { name: 'Servers', path: '/admin/servers', title: 'Servers' },
      { name: 'Permissions', path: '/admin/permissions', title: 'Permissions' },
      { name: 'Logs', path: '/admin/logs/audit', title: 'Logs' },
      { name: 'Users', path: '/admin/users', title: 'Users' }
    ];

    for (const target of targets) {
      // Click Admin collapsed group icon to open flyout menu
      const adminCollapsedBtn = page.locator('button[aria-label="Enterprise Admin"], button[aria-label="Admin"]');
      await adminCollapsedBtn.click();

      // Wait for flyout menu
      const flyout = page.locator('.rx-sidebar-flyout');
      await expect(flyout).toBeVisible();

      // Click the target item in the flyout
      const flyoutItem = flyout.getByRole('menuitem', { name: target.name });
      await expect(flyoutItem).toBeVisible();
      await flyoutItem.click();

      // Verify navigation
      await expect(page).toHaveURL(new RegExp(target.path));
      await expect(page.locator('.fiori-ph-title')).toHaveText(target.title);
    }
  });

  test('Mobile drawer (< 900px): opens drawer, lists all 4 admin items, navigates correctly', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth >= 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/home', { waitUntil: 'networkidle' });

    // Open mobile drawer
    const hamburger = page.locator('.rx-topbar-sidebar-toggle');
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const openDrawer = page.locator('.rx-sidebar.rx-sidebar-mobile-open');
    await expect(openDrawer).toBeVisible();

    // Verify all 4 admin items are present and clickable
    const targets = [
      { name: 'Servers', path: '/admin/servers', title: 'Servers' },
      { name: 'Permissions', path: '/admin/permissions', title: 'Permissions' },
      { name: 'Logs', path: '/admin/logs/audit', title: 'Logs' },
      { name: 'Users', path: '/admin/users', title: 'Users' }
    ];

    for (const target of targets) {
      // Re-open drawer if closed by previous click
      if (!await openDrawer.isVisible()) {
        await hamburger.click();
        await expect(openDrawer).toBeVisible();
      }

      const itemBtn = openDrawer.locator(`button[aria-label="Admin: ${target.name}"]`);
      await expect(itemBtn).toBeVisible();
      await itemBtn.click();

      await expect(page).toHaveURL(new RegExp(target.path));
      await expect(page.locator('.fiori-ph-title')).toHaveText(target.title);
    }
  });

  test('Non-admin user: Admin group not visible in sidebar; direct navigation shows Access Denied', async ({ page }) => {
    await setupMocks(page, { authenticated: true, user: mockNormalUser });
    await page.goto('/home', { waitUntil: 'networkidle' });

    // 1. Admin group must not be visible in sidebar (desktop or mobile drawer)
    const adminBtn = page.locator('button[aria-label="Enterprise Admin"], button[aria-label="Admin"]');
    await expect(adminBtn).toHaveCount(0);

    // 2. Direct navigation to /admin/servers shows Access Denied state, not crash
    await page.goto('/admin/servers', { waitUntil: 'networkidle' });
    const accessDeniedMsg = page.locator('text=restricted to enterprise administrators');
    await expect(accessDeniedMsg).toBeVisible();

    // 3. Direct navigation to /admin/permissions also shows Access Denied
    await page.goto('/admin/permissions', { waitUntil: 'networkidle' });
    await expect(accessDeniedMsg).toBeVisible();
  });

  test('Ctrl+K command palette navigates to admin items', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width || 1366;
    if (viewportWidth < 900) {
      test.skip();
      return;
    }

    await setupMocks(page, { authenticated: true, role: 'admin' });
    await page.goto('/home', { waitUntil: 'networkidle' });

    // Press Ctrl+K
    await page.keyboard.press('Control+k');
    const dialog = page.locator('.rx-command-palette-dialog');
    await expect(dialog).toBeVisible();

    // Search for Servers
    const searchInput = dialog.locator('input[type="text"]');
    await searchInput.fill('Servers');

    // Click SAP Servers result
    const resultItem = dialog.getByText('SAP Servers').first();
    await expect(resultItem).toBeVisible();
    await resultItem.click();

    // Verify navigation to /admin/servers
    await expect(page).toHaveURL(/\/admin\/servers/);
    await expect(page.locator('.fiori-ph-title')).toHaveText('Servers');
  });
});
