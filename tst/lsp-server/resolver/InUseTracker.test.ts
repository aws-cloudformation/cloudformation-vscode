import { mkdtempSync, readdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { InUseTracker } from '../../../src/lsp-server/resolver/InUseTracker';

const DEAD_PID = 2147483646; // Effectively guaranteed-unused PID

describe('InUseTracker', () => {
    let versionDir: string;
    let tracker: InUseTracker;

    beforeEach(() => {
        versionDir = mkdtempSync(join(tmpdir(), 'inuse-'));
        tracker = new InUseTracker();
    });

    afterEach(() => {
        rmSync(versionDir, { recursive: true, force: true });
    });

    describe('writeMarker', () => {
        it('should create a marker file named with the current pid', () => {
            tracker.writeMarker(versionDir, 'cloudformation-vscode');

            const markerPath = join(versionDir, `.inuse.${process.pid}`);
            expect(existsSync(markerPath)).toBe(true);
        });
    });

    describe('removeMarker', () => {
        it('should delete the marker for the current pid', () => {
            tracker.writeMarker(versionDir, 'cloudformation-vscode');
            tracker.removeMarker(versionDir);

            expect(existsSync(join(versionDir, `.inuse.${process.pid}`))).toBe(false);
        });
    });

    describe('isInUse', () => {
        it('should return false when versionDir does not exist', () => {
            expect(tracker.isInUse(join(versionDir, 'missing'))).toBe(false);
        });

        it('should return true when a live pid marker exists', () => {
            tracker.writeMarker(versionDir, 'cloudformation-vscode');
            expect(tracker.isInUse(versionDir)).toBe(true);
        });

        it('should return false when only dead pid markers exist', () => {
            writeFileSync(join(versionDir, `.inuse.${DEAD_PID}`), '{}');
            expect(tracker.isInUse(versionDir)).toBe(false);
        });

        it('should ignore non-marker files', () => {
            writeFileSync(join(versionDir, 'server.exe'), 'bin');
            expect(tracker.isInUse(versionDir)).toBe(false);
        });
    });

    describe('cleanStaleMarkers', () => {
        it('should remove dead pid markers but keep live ones', () => {
            writeFileSync(join(versionDir, `.inuse.${DEAD_PID}`), '{}');
            tracker.writeMarker(versionDir, 'cloudformation-vscode');

            tracker.cleanStaleMarkers(versionDir);

            const remaining = readdirSync(versionDir).filter((f) => f.startsWith('.inuse.'));
            expect(remaining).toEqual([`.inuse.${process.pid}`]);
        });

        it('should be a no-op when versionDir does not exist', () => {
            expect(() => tracker.cleanStaleMarkers(join(versionDir, 'missing'))).not.toThrow();
        });
    });
});
