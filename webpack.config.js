const { resolve } = require('path');
const webpack = require('webpack');

const standaloneConfig = {
    mode: 'production',
    target: 'node',
    devtool: 'source-map',
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
    resolve: {
        extensions: ['.ts', '.js', '.json'],
    },
    node: {
        __dirname: false,
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
                            transpileOnly: true,
                        },
                    },
                ],
                exclude: /node_modules/,
            },
        ],
    },
    optimization: {
        minimize: false,
        moduleIds: 'named',
        chunkIds: 'named',
    },
    stats: 'normal',
    performance: {
        hints: 'warning',
    },
};

module.exports = (env = {}) => {
    const nodeEnv = env.env;
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
