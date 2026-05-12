import type { AnyNode } from '../schema/mod.js';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface SeverityMeta {
  label:  Severity;
  color:  string;
  bg:     string;
  border: string;
}

export const SEVERITY_MAP: Record<AnyNode['type'], SeverityMeta> = {
  security:    { label: 'CRITICAL', color: '#dc2626', bg: '#fef2f2', border: '#dc2626' },
  danger:      { label: 'HIGH',     color: '#ea580c', bg: '#fff7ed', border: '#ea580c' },
  constraint:  { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  assumption:  { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  antipattern: { label: 'MEDIUM',   color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  pattern:     { label: 'INFO',     color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
  intent:      { label: 'INFO',     color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
  decision:    { label: 'INFO',     color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
};
