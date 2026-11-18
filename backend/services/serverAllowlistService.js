import dns from 'dns';
import net from 'net';

/**
 * Checks if a string is a valid IPv4 or IPv6 address.
 * @param {string} host
 * @returns {boolean}
 */
export function isIpAddress(host) {
  return net.isIP(String(host).trim()) !== 0;
}

/**
 * Converts an IPv4 string to a 32-bit integer.
 * @param {string} ip
 * @returns {number}
 */
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

/**
 * Checks if an IP matches a CIDR block (e.g. 192.168.1.0/24).
 * @param {string} ip
 * @param {string} cidr
 * @returns {boolean}
 */
export function matchCidr(ip, cidr) {
  if (!ip || !cidr || !cidr.includes('/')) return false;
  if (net.isIPv4(ip)) {
    const [range, bits] = cidr.split('/');
    if (!net.isIPv4(range)) return false;
    const prefixLen = parseInt(bits, 10);
    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;
    if (prefixLen === 0) return true;
    const mask = ~(2 ** (32 - prefixLen) - 1);
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
  }
  return false;
}

/**
 * Matches an IP or hostname against an allowlist pattern.
 * Supports:
 * - Exact IP or hostname (e.g. 103.206.249.51, sap-server.corp)
 * - Wildcard patterns (e.g. 192.168.12.*, 10.*, *.sap.corp)
 * - CIDR notation (e.g. 192.168.0.0/16, 10.0.0.0/8)
 *
 * @param {string} targetIpOrHost
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchPattern(targetIpOrHost, pattern) {
  if (!targetIpOrHost || !pattern) return false;
  const cleanTarget = String(targetIpOrHost).trim().toLowerCase();
  const cleanPattern = String(pattern).trim().toLowerCase();

  // 1. Exact match
  if (cleanTarget === cleanPattern) return true;

  // 2. CIDR match
  if (cleanPattern.includes('/') && isIpAddress(cleanTarget)) {
    if (matchCidr(cleanTarget, cleanPattern)) return true;
  }

  // 3. Wildcard match (e.g. 192.168.12.* or *.corp)
  if (cleanPattern.includes('*')) {
    const escaped = cleanPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    if (regex.test(cleanTarget)) return true;
  }

  return false;
}

/**
 * Computes the specificity of an allowlist pattern match.
 * More specific matches win:
 * - Exact match: 1000 + pattern length
 * - CIDR match: 500 + prefix bits (e.g. /32 = 532, /24 = 524, /16 = 516)
 * - Wildcard match: length of fixed non-wildcard characters
 *
 * @param {string} targetIpOrHost
 * @param {string} pattern
 * @returns {number} Score (higher = more specific), 0 if no match
 */
export function getPatternSpecificity(targetIpOrHost, pattern) {
  if (!matchPattern(targetIpOrHost, pattern)) return 0;
  const cleanTarget = String(targetIpOrHost).trim().toLowerCase();
  const cleanPattern = String(pattern).trim().toLowerCase();

  if (cleanTarget === cleanPattern) {
    return 1000 + cleanPattern.length;
  }

  if (cleanPattern.includes('/') && isIpAddress(cleanTarget)) {
    const bits = parseInt(cleanPattern.split('/')[1], 10) || 0;
    return 500 + bits;
  }

  if (cleanPattern.includes('*')) {
    const fixedLength = cleanPattern.replace(/\*/g, '').length;
    return 100 + fixedLength;
  }

  return 10;
}

/**
 * Finds the most specific allowlist entry matching a given host or IP.
 * @param {string} targetIpOrHost
 * @param {Array<object>} allowlist
 * @returns {object|null}
 */
export function findBestAllowlistMatch(targetIpOrHost, allowlist = []) {
  if (!targetIpOrHost || !Array.isArray(allowlist) || allowlist.length === 0) return null;
  let bestEntry = null;
  let highestScore = 0;

  for (const entry of allowlist) {
    if (!entry?.pattern) continue;
    const score = getPatternSpecificity(targetIpOrHost, entry.pattern);
    if (score > highestScore) {
      highestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry;
}

/**
 * Resolves a hostname to a list of IPv4 addresses.
 * If already an IP address, returns [ip].
 *
 * @param {string} host
 * @returns {Promise<string[]>}
 */
export async function resolveHostIps(host) {
  const cleanHost = String(host || '').trim();
  if (!cleanHost) return [];

  if (isIpAddress(cleanHost)) {
    return [cleanHost];
  }

  try {
    const records = await dns.promises.lookup(cleanHost, { all: true, family: 4 });
    const ips = records.map((r) => r.address).filter(Boolean);
    return ips.length > 0 ? ips : [];
  } catch (err) {
    return [];
  }
}

/**
 * Checks if a host or IP is a sensitive/blocked SSRF target:
 * Loopback (127.0.0.0/8, ::1, localhost, 0.0.0.0), Cloud Metadata (169.254.169.254).
 *
 * @param {string} hostOrIp
 * @returns {boolean}
 */
export function isBlockedSsrfTarget(hostOrIp) {
  if (!hostOrIp) return true;
  const clean = String(hostOrIp).trim().toLowerCase();
  if (clean === 'localhost' || clean === '::1') return true;
  if (clean === '127.0.0.1' || clean.startsWith('127.')) return true;
  if (clean === '169.254.169.254' || clean.startsWith('169.254.')) return true;
  if (clean === '0.0.0.0' || clean === '0') return true;
  return false;
}

/**
 * Extracts and validates all router hops from an SAP router string.
 * Example router string: /H/103.206.249.51/S/3299/H/
 *
 * Enforces:
 * 1. Strict rejection of router passwords (/P/)
 * 2. Strict rejection of SSRF hops (loopback, metadata)
 * 3. Validation of each hop against the administrator allowlist
 *
 * @param {string} routerString
 * @param {Array<object>} allowlist
 * @returns {Promise<{ valid: boolean, code: string, message: string }>}
 */
export async function validateRouterString(routerString, allowlist = []) {
  if (!routerString || !String(routerString).trim()) {
    return { valid: true, code: 'OK', message: 'No router configured' };
  }

  const clean = String(routerString).trim();

  // Reject /P/ (router passwords)
  if (/\/p\//i.test(clean) || /\/p$/i.test(clean)) {
    return {
      valid: false,
      code: 'ROUTER_PASSWORD_NOT_ALLOWED',
      message: 'Router passwords (/P/) are not permitted for security reasons.'
    };
  }

  // Parse /H/<host>/ hops
  const hopMatches = [...clean.matchAll(/\/H\/([^/]+)/gi)];
  if (hopMatches.length === 0) {
    return {
      valid: false,
      code: 'INVALID_ROUTER_FORMAT',
      message: 'Invalid SAP router string format. Expected /H/<host>/...'
    };
  }

  for (const match of hopMatches) {
    const hop = match[1].trim();
    if (!hop) continue;

    // Check SSRF on hop
    if (isBlockedSsrfTarget(hop)) {
      return {
        valid: false,
        code: 'ROUTER_HOP_NOT_ALLOWED',
        message: `Router hop "${hop}" is blocked (forbidden internal/loopback address).`
      };
    }

    const resolvedIps = await resolveHostIps(hop);
    if (resolvedIps.length === 0) {
      return {
        valid: false,
        code: 'ROUTER_HOP_NOT_ALLOWED',
        message: `Router hop "${hop}" could not be resolved via DNS.`
      };
    }

    for (const ip of resolvedIps) {
      if (isBlockedSsrfTarget(ip)) {
        return {
          valid: false,
          code: 'ROUTER_HOP_NOT_ALLOWED',
          message: `Router hop "${hop}" resolved to forbidden address (${ip}).`
        };
      }
    }

    // Check hop against allowlist
    const hopAllowed = allowlist.some((entry) => {
      if (!entry.pattern) return false;
      return (
        matchPattern(hop, entry.pattern) ||
        resolvedIps.some((ip) => matchPattern(ip, entry.pattern))
      );
    });

    if (!hopAllowed) {
      return {
        valid: false,
        code: 'ROUTER_HOP_NOT_ALLOWED',
        message: `Router hop "${hop}" is not permitted by administrator allowlist.`
      };
    }
  }

  return { valid: true, code: 'OK', message: 'Router verified' };
}

/**
 * Validates an SAP server connection target against:
 * 1. SNC check (SNC is rejected per specification)
 * 2. Message server check (Message server logon is rejected per specification)
 * 3. Router string check (No /P/, no SSRF hops, all hops allowlisted)
 * 4. DNS resolution & rebinding defense (all resolved IPs verified against allowlist & SSRF)
 * 5. Administrator allowlist
 *
 * If multiple IPs resolve, validates all of them and connects to the most specific match.
 * Never falls back to the hostname.
 *
 * @param {object} server - Server configuration object { ashost, router, snc, snc_mode, ... }
 * @param {Array<object>} allowlist - Active allowlist entries from database [{ pattern, type, comment }]
 * @returns {Promise<{ permitted: boolean, validatedIp: string|null, matchedType: string|null, code: string, message: string }>}
 */
export async function validateServerHost(server, allowlist = [], options = {}) {
  if (!server) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'SERVER_REQUIRED',
      message: 'Server definition is required.'
    };
  }

  // 1. SNC Out of Scope: If server requests SNC, reject immediately
  if (
    server.snc === true ||
    server.snc_mode === '1' ||
    server.snc_mode === 1 ||
    Boolean(server.snc_partnername)
  ) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'SNC_NOT_SUPPORTED',
      message: 'SNC connection is not supported. Please configure a standard RFC connection.'
    };
  }

  // 2. Message Server Logon Out of Scope: If server requests message server logon, reject
  if (server.mshost || server.msserv || server.group || server.r3name) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'MESSAGE_SERVER_NOT_SUPPORTED',
      message: 'Message server logon is not supported. Configure direct application server (ashost).'
    };
  }

  // 3. Router String Validation
  if (server.router) {
    const routerCheck = await validateRouterString(server.router, allowlist);
    if (!routerCheck.valid) {
      return {
        permitted: false,
        validatedIp: null,
        matchedType: null,
        code: routerCheck.code,
        message: routerCheck.message
      };
    }
  }

  const rawHost = server.ashost || server.host;
  if (!rawHost || !String(rawHost).trim()) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'HOST_REQUIRED',
      message: 'Server host (ashost) is required.'
    };
  }

  const cleanHost = String(rawHost).trim();

  // Check direct SSRF on raw hostname
  if (isBlockedSsrfTarget(cleanHost)) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'HOST_NOT_ALLOWED',
      message: `Server host "${cleanHost}" is a forbidden internal address (SSRF blocked).`
    };
  }

  const resolvedIps = await resolveHostIps(cleanHost);
  if (resolvedIps.length === 0) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'DNS_RESOLUTION_FAILED',
      message: `Could not resolve IP address for server host "${cleanHost}".`
    };
  }

  // 4. DNS Rebinding Check: If an expected/validated IP was established at check time,
  // ensure the hostname re-resolves to that exact validated IP at connect time.
  const expectedIp = options.expectedIp || server.expectedIp || server.validated_ip || server.validatedIp;
  if (expectedIp && !resolvedIps.includes(expectedIp)) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'DNS_REBINDING_REFUSED',
      message: `DNS rebinding detected: host "${cleanHost}" resolved to [${resolvedIps.join(', ')}] at connect time, which does not match validated IP ${expectedIp}. Connection refused.`
    };
  }

  // Reject immediately if ANY resolved IP points to a blocked SSRF address (dual-homed or rebinding trick)
  for (const ip of resolvedIps) {
    if (isBlockedSsrfTarget(ip)) {
      return {
        permitted: false,
        validatedIp: null,
        matchedType: null,
        code: 'HOST_NOT_ALLOWED',
        message: `Server host "${cleanHost}" resolved to forbidden address (${ip}).`
      };
    }
  }

  // Check if allowlist has entries; if allowlist is empty, default deny
  if (!allowlist || allowlist.length === 0) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'ALLOWLIST_EMPTY',
      message: 'No allowlist rules configured. Contact administrator to allow server hosts.'
    };
  }

  // If DNS returns several addresses, validate all of them
  let passingIp = null;
  let bestMatch = null;
  let highestScore = 0;

  for (const ip of resolvedIps) {
    const ipMatch = findBestAllowlistMatch(ip, allowlist);
    const hostMatch = findBestAllowlistMatch(cleanHost, allowlist);
    const match = ipMatch || hostMatch;

    if (match) {
      const score = Math.max(
        ipMatch ? getPatternSpecificity(ip, ipMatch.pattern) : 0,
        hostMatch ? getPatternSpecificity(cleanHost, hostMatch.pattern) : 0
      );
      if (score > highestScore) {
        highestScore = score;
        bestMatch = match;
        passingIp = ip;
      }
    }
  }

  if (!passingIp || !bestMatch) {
    return {
      permitted: false,
      validatedIp: null,
      matchedType: null,
      code: 'HOST_NOT_ALLOWED',
      message: `Server host "${cleanHost}" (${resolvedIps.join(', ')}) is not permitted by administrator allowlist.`
    };
  }

  return {
    permitted: true,
    validatedIp: passingIp,
    matchedType: bestMatch.type || 'Sandbox',
    matchedPattern: bestMatch.pattern,
    code: 'ALLOWED',
    message: 'Host verified on allowlist.'
  };
}
