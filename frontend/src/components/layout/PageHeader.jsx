import React from 'react';
import FioriPageHeader from '../FioriPageHeader';

/**
 * Shared PageHeader Component - Bridges directly to FioriPageHeader
 * Single implementation across the entire system.
 */
export default function PageHeader(props) {
  return <FioriPageHeader {...props} />;
}
