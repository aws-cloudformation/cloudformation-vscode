import { join } from 'path';
import { fsExists, fsReaddir, fsRemove, fsWriteFileAtomic, isPidAlive } from '../../utils/FileSystem';

export class InUseTracker {
    writeMarker(versionDir: string, app: string): void {
        try {
            fsWriteFileAtomic(
                join(versionDir, `.inuse.${process.pid}`),
                JSON.stringify({
                    pid: process.pid,
                    app,
                    timestamp: Date.now(),
                }),
            );
        } catch {
            // do nothing
        }
    }

    removeMarker(versionDir: string): void {
        try {
            fsRemove(join(versionDir, `.inuse.${process.pid}`));
        } catch {
            // do nothing
        }
    }

    isInUse(versionDir: string): boolean {
        if (!fsExists(versionDir)) return false;
        return fsReaddir(versionDir)
            .filter((e) => e.isFile() && e.name.startsWith('.inuse.'))
            .some((marker) => {
                const pid = Number.parseInt(marker.name.split('.inuse.')[1], 10);
                return !Number.isNaN(pid) && isPidAlive(pid);
            });
    }

    cleanStaleMarkers(versionDir: string): void {
        if (!fsExists(versionDir)) return;
        for (const marker of fsReaddir(versionDir).filter((e) => e.isFile() && e.name.startsWith('.inuse.'))) {
            const pid = Number.parseInt(marker.name.split('.inuse.')[1], 10);
            if (!Number.isNaN(pid) && !isPidAlive(pid)) {
                try {
                    fsRemove(join(versionDir, marker.name));
                } catch {
                    // do nothing
                }
            }
        }
    }
}
