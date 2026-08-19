/**
 * Generic normalized manifest model used by the base installer.
 * Environment-specific raw manifests must be converted by a concrete adapter.
 */

export interface TargetContent {
    readonly filename: string;
    readonly url: string;
    readonly hashes: string[];
    readonly bytes: number;
}

export interface Target {
    readonly platform: string;
    readonly arch: string;
    readonly contents: TargetContent[];
}

export interface Version {
    readonly serverVersion: string;
    readonly latest: boolean;
    readonly isDelisted: boolean;
    readonly targets: Target[];
}

export interface NormalizedManifest {
    readonly versions: Version[];
}

export interface FlatRawManifest extends NormalizedManifest {
    readonly manifestSchemaVersion?: string;
    readonly artifactId?: string;
    readonly artifactDescription?: string;
    readonly isManifestDeprecated?: boolean;
}

/** Transforms a client-specific raw payload into the generic flat manifest. */
export type ManifestAdapter = (raw: unknown) => NormalizedManifest;

/** Parses the generic manifest shape. Channel selection belongs in concrete adapters. */
export function defaultManifestAdapter(raw: unknown): NormalizedManifest {
    if (raw === null || typeof raw !== 'object') {
        throw new TypeError("Manifest must contain a top-level 'versions' array");
    }

    const versions = (raw as Record<string, unknown>).versions;
    if (!Array.isArray(versions)) {
        throw new TypeError("Manifest must contain a top-level 'versions' array");
    }

    return { versions: versions as Version[] };
}
