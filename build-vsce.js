#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const { platform, arch } = require('os');

const PkgPath = './package.json';
const PkgFile = fs.readFileSync(PkgPath, 'utf8');
const Pkg = JSON.parse(PkgFile);
const BackupPkgPath = `${PkgPath}.backup`;

const BUNDLE_DIR = './bundle';

function recreatePackageJson() {
    console.log('Creating package.json for VSIX build...');

    fs.copyFileSync(PkgPath, BackupPkgPath);

    const newPkg = structuredClone(Pkg);
    delete newPkg['scripts'];
    delete newPkg['devDependencies'];
    newPkg.main = `${BUNDLE_DIR}/${newPkg.name}.js`;

    fs.writeFileSync(PkgPath, JSON.stringify(newPkg, null, 2));
}

function restoreOriginalFiles() {
    console.log('Restoring original files...');

    fs.copyFileSync(BackupPkgPath, './package.json');
    fs.rmSync(BackupPkgPath);
    console.log('Restored original package.json');
}

function buildVscePackage() {
    console.log('Building VSCE package...');

    const buildEnv = process.env.BUILD_ENV || 'alpha';
    const suffix = buildEnv === 'prod' ? '' : `-${buildEnv}`;
    const outputName = `${Pkg.name}-${Pkg.version}${suffix}.vsix`;

    try {
        execSync(
            `npx vsce package --allow-missing-repository --no-dependencies --baseContentUrl file://. --out ${outputName}`,
            {
                encoding: 'utf8',
                stdio: 'pipe',
            },
        );

        if (fs.existsSync(outputName)) {
            console.log(`\n✅ Successfully created VSCE package: ${outputName}`);
        } else {
            throw new Error('VSCE build failed');
        }
    } catch (error) {
        console.error('Error building VSCE package:', error.message);
        throw error;
    }
}

function main() {
    console.log('🚀 Starting VSCE build process...\n');

    try {
        if (!fs.existsSync(BUNDLE_DIR)) {
            console.error(`Bundle directory does not exist: ${BUNDLE_DIR}`);
            console.log('Please run webpack build first: npm run build:webpack');
            process.exit(1);
        }

        recreatePackageJson();

        try {
            buildVscePackage();
        } finally {
            restoreOriginalFiles();
        }
    } catch (error) {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    }

    console.log('\n🎉 VSCE build process completed successfully!');
}

main();
