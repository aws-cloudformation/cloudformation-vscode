export type TargetContent = {
    filename: string;
    url: string;
    hashes: string[];
    bytes: number;
};

export type Target = {
    platform: string;
    arch: string;
    nodejs?: string;
    contents: TargetContent[];
};

export type Version = {
    serverVersion: string;
    latest: boolean;
    isDelisted: boolean;
    targets: Target[];
};

export type Manifest = {
    manifestSchemaVersion: string;
    artifactId: string;
    artifactDescription: string;
    isManifestDeprecated: boolean;
    alpha: Version[];
    beta: Version[];
    prod: Version[];
};
