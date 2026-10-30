import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import businessPartnerRoutes from './routes/businessPartners.js';
import entitiesRoutes from './routes/entities.js';
import chatRoutes, { TOOLS } from './routes/chat.js';
import debugRoutes from './routes/debug.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import bomRoutes from './routes/bom.js';
import sapRoutes from './routes/sap.js';
import materialsRoutes from './routes/materials.js';
import plantRoutes from './routes/plants.js';
import storageLocationRoutes from './routes/storageLocations.js';
import adminRoutes from './routes/admin.js';
import { requireAuth } from './middleware/auth.js';
import { supabaseService, verifyDatabaseConfiguration, warmupDatabaseConnection } from './services/supabaseClient.js';
import dns from 'dns';

// Ensure IPv4 resolution takes precedence to avoid dual-stack/IPv6 lookup delays
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
import { enforceHttps, safeLogger } from './middleware/security.js';
import { verifyAllToolsSafety } from './config/riskLevels.js';
import { listSystems, DEFAULT_SYSTEM, getSystemConfig } from './config/systemRegistry.js';
import { validateEncryptionKey } from './utils/crypto.js';
import { MODULE_REGISTRY, ALL_BOM_APPS } from './config/modules.js';

// Load environment configuration
dotenv.config();
console.log("SAP_DEV_URL loaded as:", process.env.SAP_DEV_URL);

// Startup safety verification: Strictly enforce Level 4 tool blocking and confirmation gates
verifyAllToolsSafety(TOOLS);

// Security startup check: Validate AES-256-GCM encryption key is configured
validateEncryptionKey(true);

// Database startup check: Verify Supabase configuration outside of test mode
try {
  verifyDatabaseConfiguration();
} catch (err) {
  console.error('Fatal database startup error:', err.message);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost';

// Trust proxy for secure cookies and rate-limiting when behind reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(enforceHttps);
app.use(safeLogger);
app.use(express.json());
app.use(cookieParser());

// Allowed CORS origins (supporting default HTTP port 80 where port is omitted by browsers)
const allowedOrigins = Array.from(new Set([
  FRONTEND_URL,
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:80',
  'http://127.0.0.1:80'
])).filter(Boolean);

// CORS configuration supporting credentials (cookies)
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-server-id', 'X-Server-Id']
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/business-partners', businessPartnerRoutes);
app.use('/api/entities', entitiesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/bom', bomRoutes);
app.use('/api/sap', sapRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/storage-locations', storageLocationRoutes);

// Server Permission & Discovery endpoint (returns permitted servers for logged-in user)
app.get('/api/servers/available', requireAuth, async (req, res) => {
  try {
    const servers = await supabaseService.getAvailableServersForUser(req.user.id, req.user.role);
    return res.status(200).json({
      success: true,
      servers
    });
  } catch (err) {
    console.error('Error fetching available servers:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve permitted servers' });
  }
});

// Module listing endpoint: Returns all registered modules for admin; only permitted modules for non-admins
app.get('/api/modules', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(200).json({
        success: true,
        modules: MODULE_REGISTRY.map((m) => m.key),
        registry: MODULE_REGISTRY
      });
    }

    // Non-admin: return only modules enabled on their permitted servers
    const availableServers = await supabaseService.getAvailableServersForUser(
      req.user.id,
      req.user.role
    );
    const permittedModuleSet = new Set();
    for (const s of availableServers) {
      const serverMods = await supabaseService.getServerModules(s.id);
      serverMods.forEach((m) => permittedModuleSet.add(m));
    }
    return res.status(200).json({
      success: true,
        modules: Array.from(permittedModuleSet)
    });
  } catch (err) {
    console.error('Error fetching modules:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve modules' });
  }
});

// Server Modules endpoint: Returns enabled modules for a server the user can access
app.get('/api/servers/:id/modules', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    // Admin bypass: Admin sees all registered modules independent of server existence or DB rows
    if (req.user.role === 'admin') {
      return res.status(200).json({
        success: true,
        serverId: id,
        modules: MODULE_REGISTRY.map((m) => m.key),
        permissions: [...ALL_BOM_APPS]
      });
    }

    const accessCheck = await supabaseService.checkUserServerAccess(
      req.user.id,
      id,
      req.user.role
    );

    if (!accessCheck.permitted) {
      return res.status(403).json({
        error: accessCheck.reason || 'Access denied: You do not have permission for this SAP server.'
      });
    }

    const modules = await supabaseService.getServerModules(id);
    return res.status(200).json({
      success: true,
      serverId: id,
      modules,
      permissions: accessCheck.permissions || []
    });
  } catch (err) {
    console.error('Error fetching server modules:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve server modules' });
  }
});

// Multi-system discovery endpoint
app.get('/api/systems', (req, res) => {
  res.status(200).json({
    defaultSystem: DEFAULT_SYSTEM,
    systems: listSystems()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mockMode: process.env.USE_MOCK_SAP !== 'false'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler (never leak stack trace or credentials in response)
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server only when executed directly (not when imported in tests)
const isMainModule = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
  path.basename(process.argv[1]) === 'server.js'
);
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`SAP Application Backend Service Running`);
    console.log(`Port: ${PORT}`);
    console.log(`Mode: ${process.env.USE_MOCK_SAP !== 'false' ? 'Mock Data Layer' : 'Real SAP Gateway'}`);
    const activeBaseUrl = getSystemConfig(DEFAULT_SYSTEM)?.baseUrl || '(not configured)';
    console.log(`SAP Base URL (${DEFAULT_SYSTEM}): ${activeBaseUrl}`);
    console.log(`Frontend URL: ${FRONTEND_URL}`);
    console.log(`=============================================`);

    // Non-blocking background warmup for Supabase connection pool
    warmupDatabaseConnection();
  });
}

export default app;
