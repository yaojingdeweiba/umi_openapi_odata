import { join } from 'path';
import { IApi } from '@umijs/max';
import rimraf from 'rimraf';
import serveStatic from 'serve-static';
import { generateService, getSchema } from './generator';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { IRoute } from '@umijs/max';
import lodash from 'lodash';

export default (api: IApi) => {
    api.describe({
        key: 'openAPI',
        config: {
            schema(joi) {
                const itemSchema = joi.object({
                    requestLibPath: joi.string(),
                    schemaPath: joi.string(),
                    mock: joi.boolean(),
                    projectName: joi.string(),
                    apiPrefix: joi.alternatives(joi.string(), joi.function()),
                    namespace: joi.string(),
                    hook: joi.object({
                        customFunctionName: joi.function(),
                        customClassName: joi.function(),
                    }),
                });
                return joi.alternatives(joi.array().items(itemSchema), itemSchema);
            },
        },
        enableBy: api.EnableBy.config,
    });
    const { absNodeModulesPath, absTmpPath } = api.paths;
    const openAPIFilesPath = join(absNodeModulesPath!, 'umi_open_api');

    try {
        if (existsSync(openAPIFilesPath)) {
            rimraf.sync(openAPIFilesPath);
        }
        mkdirSync(join(openAPIFilesPath));
    } catch (error) {
    }

    const genOpenAPIFiles = async (openAPIConfig: any) => {
        const openAPIJson = await getSchema(openAPIConfig.schemaPath);
        writeFileSync(
            join(
                openAPIFilesPath,
                `umi-plugins_${openAPIConfig.projectName || 'openapi'}.json`,
            ),
            JSON.stringify(openAPIJson, null, 2),
        );
    };
    api.onDevCompileDone(async () => {
        try {
            const openAPIConfig = api.config.openAPI;
            if (Array.isArray(openAPIConfig)) {
                openAPIConfig.map((item) => genOpenAPIFiles(item));
                return;
            }
            genOpenAPIFiles(openAPIConfig);
        } catch (error) {
            console.error(error);
        }
    });
    const genAllFiles = async (openAPIConfig: any) => {
        const pageConfig = require(join(api.cwd, 'package.json'));
        const mockFolder = openAPIConfig?.mock ? join(api.cwd, 'mock') : undefined;
        const serversFolder = join(api.cwd, 'src', 'services');
        // 如果mock 文件不存在，创建一下
        if (mockFolder && !existsSync(mockFolder)) {
            mkdirSync(mockFolder);
        }
        // 如果mock 文件不存在，创建一下
        if (serversFolder && !existsSync(serversFolder)) {
            mkdirSync(serversFolder);
        }

        await generateService({
            projectName: pageConfig.name.split('/').pop(),
            ...openAPIConfig,
            serversPath: serversFolder,
            mockFolder,
        });
        api.logger.info('[openAPI]: execution complete');
    };
    api.registerCommand({
        name: 'openapi',
        fn: async () => {
            const openAPIConfig = api.config.openAPI;
            if (Array.isArray(openAPIConfig)) {
                openAPIConfig.map((item) => genAllFiles(item));
                return;
            }
            genAllFiles(openAPIConfig);
        },
    });
};
