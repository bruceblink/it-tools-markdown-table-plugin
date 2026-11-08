import type { PluginCapabilityId } from './plugin-capabilities';

/** Metadata types for the signed Electron plugin.source.json manifest. */
export type PluginToolDataProcessing =
  | 'memory-only'
  | 'local-data'
  | 'user-selected-files'
  | 'network'
  | 'unspecified';

export type PluginToolOfflineSupport = 'available' | 'requires-network' | 'conditional' | 'unknown';

/** Capability IDs accepted in signed package metadata. The current host may expose only a subset at runtime. */
export type PluginToolCapability = PluginCapabilityId;

export interface PluginToolContribution {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly dataProcessing?: PluginToolDataProcessing;
  readonly offline?: PluginToolOfflineSupport;
  /** Must be a subset of the package requestedCapabilities list. */
  readonly capabilities?: readonly PluginToolCapability[];
}

/** Signed tool metadata exposed to the isolated runtime when a contribution is selected. */
export interface PluginToolContext {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly dataProcessing: PluginToolDataProcessing;
  readonly offline: PluginToolOfflineSupport;
  readonly capabilities: readonly PluginToolCapability[];
}

export interface PluginPackageContributions {
  readonly tools: readonly PluginToolContribution[];
}

export interface PluginPackageManifestV1 {
  readonly formatVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: {
    readonly minInclusive: string;
    readonly maxExclusive: string;
  };
  readonly entrypoint: string;
  readonly requestedCapabilities: readonly PluginToolCapability[];
  readonly contributions?: PluginPackageContributions;
}
