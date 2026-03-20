import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';

const validEnvs = ['alpha', 'beta', 'prod'] as const;
type BuildEnv = (typeof validEnvs)[number];

const buildEnv = process.argv[2] as BuildEnv;
if (!validEnvs.includes(buildEnv)) {
    console.error(`Usage: npx tsx tools/bundle.ts <${validEnvs.join('|')}>`);
    process.exit(1);
}

const pkgPath = './package.json';
const bundleDir = './bundle';
const originalPkgContent = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(originalPkgContent) as Record<string, unknown>;

function run(cmd: string): void {
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
}

function clean(): void {
    for (const dir of ['out', 'bundle']) {
        rmSync(dir, { recursive: true, force: true });
    }
}

function bundle(): void {
    console.log(`\n📦 Webpack build (${buildEnv})...\n`);
    run(`npx webpack --env env=${buildEnv}`);
}

function packageVsix(): void {
    console.log('\n📋 Preparing package.json for VSIX...');

    const vsixPkg = structuredClone(pkg);
    delete vsixPkg.scripts;
    delete vsixPkg.devDependencies;
    vsixPkg.main = `${bundleDir}/${pkg.name as string}.js`;

    const suffix = buildEnv === 'prod' ? '' : `-${buildEnv}`;
    const outputName = `${pkg.name as string}-${pkg.version as string}${suffix}.vsix`;

    writeFileSync(pkgPath, JSON.stringify(vsixPkg, undefined, 2));
    try {
        console.log('\n📦 Creating VSIX...\n');
        run(
            `npx @vscode/vsce package --allow-missing-repository --no-dependencies --baseContentUrl file://. --out ${outputName}`,
        );

        if (!existsSync(outputName)) {
            throw new Error('VSIX output file not found');
        }
        console.log(`\n✅ ${outputName}`);
    } finally {
        writeFileSync(pkgPath, originalPkgContent);
    }
}

try {
    clean();
    bundle();
    packageVsix();
} catch (error: unknown) {
    console.error(`\n❌ Build failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
