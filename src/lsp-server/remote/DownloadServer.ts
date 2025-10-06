import axios from 'axios';
import { ZipFile, fromBuffer, Entry } from 'yauzl';
import { mkdirSync, createWriteStream } from 'fs';
import { dirname, join } from 'path';

async function downloadZip(url: string): Promise<Buffer> {
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
}

export async function downloadAndUnzip(url: string, outputDir: string) {
    return await downloadZip(url).then((zipBuffer) => {
        return new Promise<void>((resolve, reject) => {
            fromBuffer(
                zipBuffer,
                {
                    lazyEntries: true,
                    autoClose: true,
                },
                (err: Error | null, zipFile: ZipFile) => {
                    if (err) {
                        return reject(new Error(err.message));
                    } else if (!zipFile) {
                        return reject(new Error('Failed to open ZIP file'));
                    }

                    console.info(`Downloading AWS CloudFormation LSP to ${outputDir}`);
                    makeDir(outputDir);

                    zipFile.on('entry', (entry: Entry) => {
                        const fullPath = join(outputDir, entry.fileName);

                        if (entry.fileName.endsWith('/')) {
                            // Directory entry
                            makeDir(fullPath);
                            zipFile.readEntry(); // Move to the next entry
                        } else {
                            // File entry
                            zipFile.openReadStream(entry, (err, readStream) => {
                                if (err || !readStream) {
                                    return reject(err ?? new Error(`Failed to read entry: ${entry.fileName}`));
                                }

                                readStream.on('error', (err) => {
                                    reject(err);
                                });

                                // Ensure the directory for the file exists
                                const parentDir = dirname(fullPath);
                                makeDir(parentDir);
                                const writeStream = createWriteStream(fullPath);
                                readStream.pipe(writeStream);

                                writeStream.on('finish', () => {
                                    zipFile.readEntry();
                                });
                                writeStream.on('error', (err) => {
                                    reject(err);
                                });
                            });
                        }
                    });

                    zipFile.on('end', () => {
                        resolve();
                    });

                    zipFile.on('error', (err) => {
                        return reject(new Error(String(err)));
                    });

                    // Start processing the first entry
                    zipFile.readEntry();
                },
            );
        });
    });
}

function makeDir(path: string) {
    mkdirSync(path, { recursive: true });
}
