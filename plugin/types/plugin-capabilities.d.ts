/** Capability IDs accepted by the signed plugin package format. */
export type PluginCapabilityId =
  | 'clipboard.write'
  | 'data.oui'
  | 'device.camera'
  | 'file.read'
  | 'file.save'
  | 'runtime.info'
  | 'settings.read'
  | 'settings.write';

/** Capability IDs currently executable by the Electron plugin host. */
export type PluginHostCapability = Extract<
  PluginCapabilityId,
  'runtime.info' | 'clipboard.write' | 'settings.read' | 'settings.write'
>;
