import type {
  PluginCapabilityId,
  PluginHostCapability,
} from './plugin-capabilities';
import type { PluginApiV1Version } from './plugin-api-version';
import type {
  PluginToolContext,
} from './it-tools-plugin-package';
import type { PluginApiErrorCode } from './plugin-api-errors';
export type { PluginToolContext } from './it-tools-plugin-package';
export type { PluginApiErrorCode } from './plugin-api-errors';

export interface PluginRuntimeInfo {
  readonly platform: string;
  readonly version: string;
}

export interface PluginClipboardWriteResult {
  readonly written: true;
}

export type PluginSettingValue = string | number | boolean | null;

export interface PluginSettingWriteResult {
  readonly written: true;
}

export interface PluginSettingDeleteResult {
  readonly deleted: boolean;
}

export class PluginApiError extends Error {
  readonly code: PluginApiErrorCode;
  readonly status: number;
}

/** Read-only capability metadata for rendering plugin permission state. */
export interface PluginPermissionSnapshot {
  /** Capabilities declared by the signed package manifest. */
  readonly requestedCapabilities: readonly PluginCapabilityId[];
  /** Capabilities executable by this host implementation. */
  readonly supportedCapabilities: readonly PluginHostCapability[];
  /** Capabilities granted to this isolated window for its current launch. */
  readonly grantedCapabilities: readonly PluginHostCapability[];
}

/** Signed metadata for the package that owns the current isolated plugin window. */
export interface PluginPackageContext {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export interface ITToolsPluginApiV1 {
  readonly apiVersion: PluginApiV1Version;
  readonly hostApiVersion: PluginApiV1Version;
  /** The host-verified package metadata for this plugin window. */
  readonly plugin: PluginPackageContext;
  /** The host-verified contribution ID selected when this plugin window was opened. The host value takes precedence over metadata and URL fallback values. */
  readonly toolId: string | undefined;
  /** The host-verified contribution metadata selected when this plugin window was opened. */
  readonly tool: PluginToolContext | undefined;
  /** Capability metadata only; this object never grants or revokes a capability. */
  readonly permissions: PluginPermissionSnapshot;
  readonly capabilities: {
    readonly runtime: {
      getInfo(): Promise<PluginRuntimeInfo>;
    };
    readonly clipboard: {
      writeText(text: string): Promise<PluginClipboardWriteResult>;
    };
    readonly settings: {
      get(key: string): Promise<PluginSettingValue | undefined>;
      set(key: string, value: PluginSettingValue): Promise<PluginSettingWriteResult>;
      delete(key: string): Promise<PluginSettingDeleteResult>;
    };
  };
  readonly PluginApiError: typeof PluginApiError;
}

declare global {
  interface Window {
    readonly itTools: ITToolsPluginApiV1;
  }
}

export {};
