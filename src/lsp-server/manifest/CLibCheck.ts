import { execSync } from 'child_process';
import { coerce, compare } from 'semver';
import { fsExists, fsReadFileString } from '../../utils/FileSystem';

interface VersionResult {
    maxFound: string | undefined;
    allAvailable: string[];
}

export class CLibCheck {
    public static getGLibCXXVersions(): VersionResult {
        const libPath = this.findLibStdCpp();
        if (!libPath) {
            return { maxFound: undefined, allAvailable: [] };
        }

        try {
            const output = execSync(`strings "${libPath}" | grep GLIBCXX`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 10_000,
            });
            return this.parseGLibCXXOutput(output);
        } catch {
            try {
                const content = fsReadFileString(libPath, 'binary' as BufferEncoding);
                const matches = content.match(/GLIBCXX_\d+\.\d+\.\d+/g);
                if (matches) {
                    return this.parseGLibCXXOutput(matches.join('\n'));
                }
            } catch {
                // ignore
            }
        }

        return { maxFound: undefined, allAvailable: [] };
    }

    private static parseGLibCXXOutput(rawOutput: string): VersionResult {
        const rawVersions = rawOutput
            .trim()
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('GLIBCXX_'))
            .map((line) => {
                const match = line.match(/^GLIBCXX_(\d+\.\d+\.\d+)/);
                return match ? match[1] : undefined;
            })
            .filter((v): v is string => v !== undefined);

        const uniqueVersions = [...new Set(rawVersions)];
        const sorted = uniqueVersions.toSorted((a, b) => {
            const verA = coerce(a);
            const verB = coerce(b);
            if (!verA || !verB) {
                return 0;
            }
            return compare(verA, verB);
        });

        return {
            maxFound: sorted.at(-1),
            allAvailable: sorted,
        };
    }

    private static findLibStdCpp(): string | undefined {
        try {
            const ldconfig = execSync('/sbin/ldconfig -p | grep libstdc++.so.6', {
                encoding: 'utf8',
                timeout: 5000,
            });
            const match = ldconfig.match(/=>\s+(.+)$/m);
            if (match?.[1]) {
                return match[1].trim();
            }
        } catch {
            // ignore
        }

        const commonPaths = [
            '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
            '/usr/lib64/libstdc++.so.6',
            '/usr/lib/libstdc++.so.6',
            '/lib/x86_64-linux-gnu/libstdc++.so.6',
        ];

        return commonPaths.find((p) => fsExists(p));
    }
}
