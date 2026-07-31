declare const __TLIVE_BUILD_ID__: string;

/** Shared by the bundled CLI and daemon; source-mode tests use a stable fallback. */
export const BUILD_ID = typeof __TLIVE_BUILD_ID__ === 'string' ? __TLIVE_BUILD_ID__ : 'dev';

export function isCurrentBuild(runningBuildId: string | undefined): boolean {
  return runningBuildId === BUILD_ID;
}
