const { resolve } = require('path');
const webpack = require('webpack');

const commonConfig = {
    mode: 'production',
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.js', '.node'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.bundle.json',
                            transpileOnly: false,
                        },
                    },
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.node$/,
                use: {
                    loader: 'node-loader',
                    options: {
                        name: '[name].[ext]',
                    },
                },
            },
        ],
    },
    optimization: {
        minimize: false,
        moduleIds: 'deterministic',
        chunkIds: 'deterministic',
        usedExports: true,
        sideEffects: false,
    },
    stats: {
        colors: true,
        modules: false,
        children: false,
        chunks: false,
        chunkModules: false,
    },
    performance: {
        hints: 'warning',
    },
};

const standaloneConfig = {
    ...commonConfig,
    target: 'node',
    entry: './src/extension.ts',
    output: {
        clean: true,
        path: resolve(__dirname, 'bundle'),
        filename: 'cloudformation-vscode.js',
        library: {
            type: 'commonjs2',
        },
    },
    externals: {
        vscode: 'commonjs vscode',
    },
};

module.exports = (env = {}) => {
    const nodeEnv = env.env;

   // Validate env
    const validEnvs = ['alpha', 'beta', 'prod'];
    if (!validEnvs.includes(nodeEnv)) {
        console.error(`Invalid env: ${nodeEnv}. Valid options: ${validEnvs.join(', ')}`);
        process.exit(1);
    }

    console.info(`Building client with AWS_ENV: ${nodeEnv}`);

    return [{
        ...standaloneConfig,
        plugins: [
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify('production'),
                'process.env.AWS_ENV': JSON.stringify(nodeEnv),
            }),
        ],
    }];
};
