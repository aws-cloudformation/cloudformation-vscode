import { createWriteStream } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import yauzl from 'yauzl';
import type { FileSystem } from './BaseLspInstaller';

/**
 * Validates a zip entry filename against path traversal attacks.
 * Rejects absolute paths, Windows drive/UNC paths, parent directory
 * traversal, backslash separators, and entries resolving outside destDir.
 */
export function isZipEntrySafe(entryName: string, destDir: string): boolean {
    if (entryName.includes('\\')) {
        return false;
    }

    if (entryName.startsWith('/')) {
        return false;
    }

    if (/^[a-zA-Z]:/.test(entryName)) {
        return false;
    }

    const segments = entryName.split('/');
    if (segments.includes('..')) {
        return false;
    }

    const resolvedDestination = resolve(destDir);
    const resolvedEntry = resolve(resolvedDestination, entryName);
    const entryRelativePath = relative(resolvedDestination, resolvedEntry);

    return entryRelativePath !== '..' && !entryRelativePath.startsWith(`..${sep}`) && !isAbsolute(entryRelativePath);
}

/**
 * Extracts all .zip files in a directory, placing contents in a sibling
 * directory named after the zip (without the .zip extension).
 */
export async function extractZips(dir: string, fs: FileSystem): Promise<void> {
    const zips = fs
        .readdir(dir)
        .filter((f) => f.isFile() && f.name.endsWith('.zip'))
        .map((f) => f.name);

    for (const zipName of zips) {
        const zipPath = join(dir, zipName);
        const extractDir = zipPath.replace(/\.zip$/, '');
        fs.mkdirRecursive(extractDir);
        await extractZip(zipPath, extractDir, fs);
    }
}

/**
 * Removes all .zip files from a directory.
 */
export function deleteZips(dir: string, fs: FileSystem): void {
    for (const entry of fs.readdir(dir)) {
        if (entry.isFile() && entry.name.endsWith('.zip')) {
            fs.remove(join(dir, entry.name));
        }
    }
}

function extractZip(zipPath: string, destDir: string, fs: FileSystem): Promise<void> {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err ?? !zipfile) {
                reject(err ?? new Error(`Failed to open ${zipPath}`));
                return;
            }

            zipfile.readEntry();
            zipfile.on('entry', (entry: yauzl.Entry) => {
                if (!isZipEntrySafe(entry.fileName, destDir)) {
                    reject(new Error(`Zip path traversal rejected: ${entry.fileName}`));
                    zipfile.close();
                    return;
                }

                const entryPath = join(destDir, entry.fileName);

                if (entry.fileName.endsWith('/')) {
                    fs.mkdirRecursive(entryPath);
                    zipfile.readEntry();
                    return;
                }

                fs.mkdirRecursive(dirname(entryPath));
                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr ?? !readStream) {
                        reject(streamErr ?? new Error(`Failed to read ${entry.fileName}`));
                        return;
                    }

                    const writeStream = createWriteStream(entryPath);
                    readStream.pipe(writeStream);
                    writeStream.on('close', () => zipfile.readEntry());
                    writeStream.on('error', reject);
                });
            });

            zipfile.on('end', resolve);
            zipfile.on('error', reject);
        });
    });
}
